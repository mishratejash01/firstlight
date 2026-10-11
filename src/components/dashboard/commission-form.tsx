"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CommissionImage } from "@/lib/ai/steer";
import {
  answerCommission,
  discardCommission,
  startCommission,
  uploadCommissionImage,
  type EngineTurn,
} from "@/app/admin/steer-actions";

import { SteerDialog } from "./steer-dialog";

/**
 * Commissions one story: the brief in plain words, and the pictures to use.
 *
 * Pictures go up first, each with a description and a credit, so the engine
 * can ask about them by number. Sending the brief opens the dialogue; the
 * story is queued for the desk only once the engine has said what it will
 * write.
 */
export function CommissionForm() {
  const router = useRouter();
  const [images, setImages] = useState<CommissionImage[]>([]);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("Special arrangement");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ id: string; turn: EngineTurn } | null>(null);

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  async function upload() {
    if (!file) {
      setUploadError("Choose a picture first.");
      return;
    }
    if (!alt.trim()) {
      setUploadError("Describe what the picture shows.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("alt", alt);
    formData.set("caption", caption);
    formData.set("credit", credit);
    try {
      const result = await uploadCommissionImage(formData);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      setImages((list) => [...list, result.image]);
      setFile(null);
      setAlt("");
      setCaption("");
      setAdding(false);
    } catch (cause) {
      setUploadError(cause instanceof Error ? `Upload failed: ${cause.message}` : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("images", JSON.stringify(images));
    try {
      const result = await startCommission(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setImages([]);
      setDialogue({ id: result.id, turn: result.turn });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-5 max-w-2xl space-y-5">
        <div>
          <label htmlFor="commission-prompt" className="block text-meta text-muted">
            The story, as you want it written
          </label>
          <textarea
            id="commission-prompt"
            name="prompt"
            required
            rows={6}
            placeholder="A report on today's PanIIT summit in Vijayawada. Lead with the Chief Minister's announcement of the Amaravati council. Warm towards the state's ambitions. Use my photo of Nara Lokesh at the podium as the main picture. Publish as breaking."
            className={fieldClass}
          />
          <p className="mt-1 max-w-measure text-meta leading-relaxed text-muted">
            Say what it is about, the line to take, the facts you know, links worth reading, and
            whether it should go live at once. The engine asks about whatever is left open.
          </p>
        </div>

        <div>
          <p className="text-meta text-muted">Pictures ({images.length})</p>
          {images.length ? (
            <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
              {images.map((image, index) => (
                <li key={image.publicId || image.url} className="flex items-center gap-3 py-2">
                  {/* The media library's own address; the site's image loader is for pages, not forms. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="h-12 w-16 shrink-0 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-meta text-ink">
                      Picture {index + 1}: {image.alt}
                    </p>
                    <p className="truncate text-meta text-muted">
                      {image.caption ? `${image.caption} · ` : ""}
                      {image.credit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImages((list) => list.filter((_, i) => i !== index))}
                    className="text-meta text-accent underline underline-offset-4"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {adding ? (
            <div className="mt-3 space-y-3 border-l-2 border-hairline pl-4">
              <div>
                <label htmlFor="commission-file" className="block text-meta text-muted">
                  Picture — JPEG, PNG, WebP, AVIF or GIF up to 10MB
                </label>
                <input
                  id="commission-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setUploadError(null);
                  }}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="commission-alt" className="block text-meta text-muted">
                  What it shows (required)
                </label>
                <input
                  id="commission-alt"
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  placeholder="Nara Lokesh speaking at the PanIIT summit in Vijayawada"
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="commission-caption" className="block text-meta text-muted">
                  Caption (optional — the engine can write one)
                </label>
                <input
                  id="commission-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="commission-credit" className="block text-meta text-muted">
                  Credit
                </label>
                <input
                  id="commission-credit"
                  value={credit}
                  onChange={(event) => setCredit(event.target.value)}
                  className={fieldClass}
                />
              </div>
              {uploadError ? (
                <p role="alert" className="text-meta text-signal">
                  {uploadError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={upload}
                  disabled={uploading || !file}
                  className="rounded-control border border-hairline px-4 py-2 text-body text-ink hover:border-muted disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Upload this picture"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setUploadError(null);
                  }}
                  disabled={uploading}
                  className="rounded-control border border-hairline px-4 py-2 text-body text-ink hover:border-muted disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 rounded-control border border-hairline px-4 py-2 text-body text-ink hover:border-muted"
            >
              Add a picture
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-meta text-signal">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || uploading}
            className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "The engine is reading it…" : "Ask the engine"}
          </button>
        </div>
      </form>

      {dialogue ? (
        <SteerDialog
          title="Settling the brief"
          initial={dialogue.turn}
          onAnswer={(payload) => answerCommission({ id: dialogue.id, ...payload })}
          onDiscard={() => discardCommission(dialogue.id)}
          onClose={() => {
            setDialogue(null);
            router.refresh();
          }}
          doneTitle="Brief noted."
          doneDetail="The story is queued. The desk writes it on its next pass, within about two minutes, or press 'Write it now' in the list below. This is what the engine understood, in its own words."
        />
      ) : null}
    </>
  );
}
