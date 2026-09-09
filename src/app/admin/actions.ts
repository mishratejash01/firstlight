"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";

/**
 * Administration actions.
 *
 * Role grants go through the request-scoped client so RLS applies: the
 * user_roles insert policy requires the caller to be an admin, which means a
 * bug in the check below cannot become a privilege-escalation hole.
 *
 * Listing accounts is the exception. auth.users is not exposed through the Data
 * API at all, so it needs the privileged client — which bypasses RLS entirely.
 * That is why the admin check there is written out explicitly and performed
 * before the client is created.
 */

type ActionResult = { error: string } | { ok: true };

const ROLES: AppRole[] = ["admin", "editor", "author"];

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("admin")) return null;
  return user;
}

/**
 * Grants or revokes one role in a single call.
 *
 * The dashboard previously offered a dropdown plus a Grant button plus a
 * separate Revoke button per role — three controls to express one binary fact.
 * A single toggle carrying its own current state is both less code and far
 * less to read: the button says what is true now and what one click will make
 * true instead.
 */
export async function toggleRole(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;
  const grant = String(formData.get("grant") ?? "") === "true";

  if (!userId) return { error: "Missing account." };
  if (!ROLES.includes(role)) return { error: "Unknown role." };

  // An admin removing their own admin role locks the newsroom out of its own
  // administration, and recovering needs the service key. Refuse it here.
  if (!grant && userId === admin.id && role === "admin") {
    return {
      error: "You cannot remove your own administrator role. Ask another administrator.",
    };
  }

  const supabase = await createClient();

  if (grant) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role, granted_by: admin.id });
    // A duplicate grant means the desired state already holds; not a failure.
    if (error && error.code !== "23505") return { error: error.message };
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/people");
  revalidatePath("/admin");
  return { ok: true };
}

export type AccountRow = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

/**
 * Lists accounts. Privileged, and gated before the privileged client exists.
 *
 * Returns a discriminated result rather than a bare array: an empty list and a
 * failed lookup look identical to a caller, and "Accounts (0)" on a page that
 * plainly has accounts is exactly the kind of silent wrongness that makes an
 * administrator stop trusting the dashboard.
 */
export async function listAccounts(): Promise<
  { ok: true; accounts: AccountRow[] } | { ok: false; reason: string }
> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, reason: "Administrator role required." };

  let data;
  try {
    const client = createAdminClient();
    const result = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (result.error) return { ok: false, reason: result.error.message };
    data = result.data;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Could not reach the account service.",
    };
  }

  const accounts = data.users.map((user) => ({
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  }));

  return { ok: true, accounts };
}

/** Shows or hides a section in the site navigation. */
export async function setCategoryVisibility(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Administrator role required." };

  const id = String(formData.get("category_id") ?? "");
  const showInNav = String(formData.get("show_in_nav") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ show_in_nav: showInNav })
    .eq("id", id);

  if (error) return { error: error.message };

  // The navigation is rendered on every page, so every page is now stale.
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return { ok: true };
}
