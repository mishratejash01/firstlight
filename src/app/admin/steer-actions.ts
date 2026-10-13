"use server";

import { revalidatePath } from "next/cache";

import {
  commissionDialogueTurn,
  MAX_ROUNDS,
  steerDialogueTurn,
  type AdminAnswer,
  type CommissionImage,
  type DialogueQuestion,
  type TranscriptTurn,
} from "@/lib/ai/steer";
import { getSessionUser } from "@/lib/auth/roles";
import { loadActiveDirectives } from "@/lib/engine/directives";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadToCloudinary } from "@/lib/media/cloudinary";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Steering actions: standing instructions and commissioned stories.
 *
 * Both start a dialogue with the engine and end it only when the engine says
 * it has understood. Every write here goes through the request-scoped client,
 * so the admin-only policies on the two tables are what decide, not the
 * check at the top of each function.
 */

type ActionResult = { error: string } | { ok: true; note?: string };

export type EngineTurn = {
  satisfied: boolean;
  questions: DialogueQuestion[];
  understanding: string;
  round: number;
  maxRounds: number;
  /** What has been asked and answered so far, for a dialogue picked up again. */
  history: { question: string; answer: string }[];
};

export type DialogueStart = { ok: true; id: string; turn: EngineTurn } | { ok: false; error: string };
export type DialogueReply = { ok: true; turn: EngineTurn } | { ok: false; error: string };

const TTL_OPTIONS: Record<string, { hours: number | null; label: string }> = {
  "24h": { hours: 24, label: "24 hours" },
  "48h": { hours: 48, label: "48 hours" },
  "7d": { hours: 168, label: "7 days" },
  "30d": { hours: 720, label: "30 days" },
  never: { hours: null, label: "until it is removed" },
};

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

function ttlLabel(hours: number | null): string {
  return Object.values(TTL_OPTIONS).find((o) => o.hours === hours)?.label ?? `${hours} hours`;
}

function readTranscript(raw: unknown): TranscriptTurn[] {
  return Array.isArray(raw) ? (raw as TranscriptTurn[]) : [];
}

function asEngineTurn(
  turn: { satisfied: boolean; questions: DialogueQuestion[]; understanding: string },
  transcript: TranscriptTurn[],
): EngineTurn {
  const history: { question: string; answer: string }[] = [];
  for (const past of transcript) {
    if (past.role !== "admin") continue;
    for (const a of past.answers) history.push({ question: a.question, answer: a.answer });
    if (past.note) history.push({ question: "Added", answer: past.note });
  }
  return {
    satisfied: turn.satisfied,
    questions: turn.questions,
    understanding: turn.understanding,
    round: transcript.filter((t) => t.role === "engine").length,
    maxRounds: MAX_ROUNDS,
    history,
  };
}

async function sectionNames(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("categories").select("name").eq("is_active", true).order("name");
  return (data ?? []).map((c) => c.name);
}

function cleanAnswers(raw: unknown, questions: DialogueQuestion[]): AdminAnswer[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  return raw
    .filter((a): a is AdminAnswer => Boolean(a) && typeof a === "object" && typeof a.questionId === "string")
    .filter((a) => byId.has(a.questionId))
    .map((a) => ({
      questionId: a.questionId,
      question: byId.get(a.questionId)!.text,
      answer: String(a.answer ?? "").trim().slice(0, 2000),
    }))
    .filter((a) => a.answer);
}

/** The engine's last turn in a transcript, so answers can be matched to its questions. */
function lastEngineTurn(transcript: TranscriptTurn[]) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const turn = transcript[i];
    if (turn.role === "engine") return turn;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Standing instructions
// ---------------------------------------------------------------------------

async function runDirectiveTurn(id: string): Promise<DialogueReply> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("engine_directives")
    .select("id, prompt, ttl_hours, transcript, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "That instruction no longer exists." };

  const transcript = readTranscript(row.transcript);
  const active = (await loadActiveDirectives()).filter((d) => d.id !== id);
  const result = await steerDialogueTurn({
    prompt: row.prompt,
    ttlLabel: ttlLabel(row.ttl_hours),
    transcript,
    sections: await sectionNames(),
    active,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const turn = result.data;
  transcript.push({
    role: "engine",
    at: new Date().toISOString(),
    satisfied: turn.satisfied,
    questions: turn.questions,
    understanding: turn.understanding,
  });

  const now = new Date();
  const { error } = await supabase
    .from("engine_directives")
    .update(
      turn.satisfied
        ? {
            transcript,
            understanding: turn.understanding,
            rules: turn.rules,
            status: "active",
            activated_at: now.toISOString(),
            expires_at: row.ttl_hours ? new Date(now.getTime() + row.ttl_hours * 3600_000).toISOString() : null,
          }
        : { transcript, status: "drafting" },
    )
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/steer");
  return { ok: true, turn: asEngineTurn(turn, transcript) };
}

/** Opens a dialogue about a new standing instruction. */
export async function startDirective(formData: FormData): Promise<DialogueStart> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const prompt = String(formData.get("prompt") ?? "").trim();
  const ttl = TTL_OPTIONS[String(formData.get("ttl") ?? "")];
  if (prompt.length < 10) return { ok: false, error: "Say what the engine should do, in a sentence or more." };
  if (!ttl) return { ok: false, error: "Choose how long the instruction should hold." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("engine_directives")
    .insert({ prompt, ttl_hours: ttl.hours, created_by: admin.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const reply = await runDirectiveTurn(row.id);
  return reply.ok ? { ok: true, id: row.id, turn: reply.turn } : reply;
}

/** Answers the engine's questions, or adds a correction, and gets its next turn. */
export async function answerDirective(input: {
  id: string;
  answers: AdminAnswer[];
  note: string;
}): Promise<DialogueReply> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("engine_directives")
    .select("id, status, transcript")
    .eq("id", input.id)
    .maybeSingle();
  if (!row || row.status === "deleted" || row.status === "expired") {
    return { ok: false, error: "That instruction is no longer open." };
  }

  const transcript = readTranscript(row.transcript);
  const last = lastEngineTurn(transcript);
  const answers = cleanAnswers(input.answers, last?.questions ?? []);
  const note = String(input.note ?? "").trim().slice(0, 4000);
  if (!answers.length && !note) return { ok: false, error: "Answer the questions, or write what should change." };

  transcript.push({ role: "admin", at: new Date().toISOString(), answers, note });
  // A correction to an instruction already in force takes it out of force
  // until the engine has understood the corrected version.
  const { error } = await supabase
    .from("engine_directives")
    .update({ transcript, status: "drafting" })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  return runDirectiveTurn(input.id);
}

/**
 * Picks up a dialogue that did not finish — a closed tab, a dropped
 * connection, a deploy while it was open. The engine's last questions are
 * shown again; if the answers went through but the engine's reply did not,
 * it is asked now.
 */
export async function resumeDirective(id: string): Promise<DialogueStart> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("engine_directives")
    .select("id, status, transcript")
    .eq("id", id)
    .maybeSingle();
  if (!row || !["drafting", "active"].includes(row.status)) return { ok: false, error: "That instruction is not open." };

  const transcript = readTranscript(row.transcript);
  const last = transcript.at(-1);
  if (last?.role === "engine") return { ok: true, id, turn: asEngineTurn(last, transcript) };
  const reply = await runDirectiveTurn(id);
  return reply.ok ? { ok: true, id, turn: reply.turn } : reply;
}

/** Removes an instruction from the engine, at once. */
export async function deleteDirective(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const id = String(formData.get("directive_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("engine_directives")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/steer");
  return { ok: true };
}

/** Abandons a dialogue that never closed. */
export async function discardDirective(id: string): Promise<ActionResult> {
  const formData = new FormData();
  formData.set("directive_id", id);
  return deleteDirective(formData);
}

// ---------------------------------------------------------------------------
// Commissioned stories
// ---------------------------------------------------------------------------

export type ImageUploadResult = { ok: true; image: CommissionImage } | { ok: false; error: string };

/** Uploads one of the editor's pictures for a commissioned story. */
export async function uploadCommissionImage(formData: FormData): Promise<ImageUploadResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture to upload." };
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Use a JPEG, PNG, WebP, AVIF or GIF picture." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `That picture is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The limit is 10MB.` };
  }

  const alt = String(formData.get("alt") ?? "").trim().slice(0, 300);
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 500);
  const credit = String(formData.get("credit") ?? "").trim().slice(0, 120) || "Special arrangement";
  if (!alt) return { ok: false, error: "Describe what the picture shows." };

  let asset;
  try {
    asset = await uploadToCloudinary(file);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The upload failed." };
  }

  // Recorded as the administrator's own picture, so the illustrator never
  // replaces it.
  const supabase = await createClient();
  await supabase.from("media_assets").insert({
    public_id: asset.publicId,
    secure_url: asset.secureUrl,
    resource_type: asset.resourceType,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    duration: asset.duration,
    alt_text: alt,
    credit,
    uploaded_by: admin.id,
  });

  return {
    ok: true,
    image: {
      url: asset.secureUrl,
      publicId: asset.publicId,
      width: asset.width,
      height: asset.height,
      alt,
      caption,
      credit,
    },
  };
}

function readImages(raw: string): CommissionImage[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => typeof item.url === "string" && item.url.startsWith("https://res.cloudinary.com/"))
      .map((item) => ({
        url: item.url as string,
        publicId: typeof item.publicId === "string" ? item.publicId : "",
        width: typeof item.width === "number" ? item.width : null,
        height: typeof item.height === "number" ? item.height : null,
        alt: typeof item.alt === "string" ? item.alt.slice(0, 300) : "",
        caption: typeof item.caption === "string" ? item.caption.slice(0, 500) : "",
        credit: typeof item.credit === "string" ? item.credit.slice(0, 120) : "",
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function runCommissionTurn(id: string): Promise<DialogueReply> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("commissioned_posts")
    .select("id, prompt, images, transcript")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "That commission no longer exists." };

  const admin = createAdminClient();
  const { data: delay } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "autonomous_publish_delay_minutes")
    .maybeSingle();

  const transcript = readTranscript(row.transcript);
  const result = await commissionDialogueTurn({
    prompt: row.prompt,
    images: readImages(JSON.stringify(row.images)),
    transcript,
    sections: await sectionNames(),
    delayMinutes: Number(delay?.value ?? 0) || 0,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const turn = result.data;
  transcript.push({
    role: "engine",
    at: new Date().toISOString(),
    satisfied: turn.satisfied,
    questions: turn.questions,
    understanding: turn.understanding,
  });

  const { error } = await supabase
    .from("commissioned_posts")
    .update(
      turn.satisfied
        ? { transcript, understanding: turn.understanding, brief: turn.brief, status: "queued", last_error: null }
        : { transcript, status: "drafting" },
    )
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/steer");
  return { ok: true, turn: asEngineTurn(turn, transcript) };
}

/** Opens a dialogue about a story to commission. */
export async function startCommission(formData: FormData): Promise<DialogueStart> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const prompt = String(formData.get("prompt") ?? "").trim();
  if (prompt.length < 10) return { ok: false, error: "Say what the story is, in a sentence or more." };
  const images = readImages(String(formData.get("images") ?? "[]"));

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("commissioned_posts")
    .insert({ prompt, images, created_by: admin.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const reply = await runCommissionTurn(row.id);
  return reply.ok ? { ok: true, id: row.id, turn: reply.turn } : reply;
}

/** Answers the engine's questions about a commission, or corrects the brief. */
export async function answerCommission(input: {
  id: string;
  answers: AdminAnswer[];
  note: string;
}): Promise<DialogueReply> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("commissioned_posts")
    .select("id, status, transcript")
    .eq("id", input.id)
    .maybeSingle();
  if (!row || !["drafting", "queued"].includes(row.status)) {
    return { ok: false, error: "That commission is no longer open: the desk has it." };
  }

  const transcript = readTranscript(row.transcript);
  const last = lastEngineTurn(transcript);
  const answers = cleanAnswers(input.answers, last?.questions ?? []);
  const note = String(input.note ?? "").trim().slice(0, 4000);
  if (!answers.length && !note) return { ok: false, error: "Answer the questions, or write what should change." };

  transcript.push({ role: "admin", at: new Date().toISOString(), answers, note });
  const { error } = await supabase
    .from("commissioned_posts")
    .update({ transcript, status: "drafting" })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  return runCommissionTurn(input.id);
}

/** Picks up a commission dialogue that did not finish; see resumeDirective. */
export async function resumeCommission(id: string): Promise<DialogueStart> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: "Administrator role required." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("commissioned_posts")
    .select("id, status, transcript")
    .eq("id", id)
    .maybeSingle();
  if (!row || !["drafting", "queued"].includes(row.status)) return { ok: false, error: "That commission is not open." };

  const transcript = readTranscript(row.transcript);
  const last = transcript.at(-1);
  if (last?.role === "engine") return { ok: true, id, turn: asEngineTurn(last, transcript) };
  const reply = await runCommissionTurn(id);
  return reply.ok ? { ok: true, id, turn: reply.turn } : reply;
}

/** Withdraws a commission that has not been written. */
export async function deleteCommission(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const id = String(formData.get("commission_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("commissioned_posts")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["drafting", "queued", "failed"]);
  if (error) return { error: error.message };

  revalidatePath("/admin/steer");
  return { ok: true };
}

export async function discardCommission(id: string): Promise<ActionResult> {
  const formData = new FormData();
  formData.set("commission_id", id);
  return deleteCommission(formData);
}

/** Writes a queued commission now rather than on the desk's next pass. Takes up to a minute. */
export async function writeCommissionNow(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const id = String(formData.get("commission_id") ?? "");
  // Back to the front of the queue, with its attempts given back if it had
  // failed; the brief is unchanged. The desk's next pass, within two minutes,
  // writes commissions before anything else. It is not written here, inside
  // the admin's own request: writing takes a minute or two, longer than the
  // edge in front of the site will wait for an answer.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commissioned_posts")
    .update({ status: "queued", attempts: 0, claimed_at: null, last_error: null })
    .eq("id", id)
    .in("status", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This commission is not waiting to be written." };
  revalidatePath("/admin/steer");
  return { ok: true, note: "Queued first for the desk's next pass, within about two minutes." };
}
