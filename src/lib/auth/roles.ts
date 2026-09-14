import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type SessionUser = {
  id: string;
  email: string | null;
  roles: AppRole[];
};

/**
 * Resolves the caller from the request cookies, or null if signed out.
 *
 * Uses getClaims(), which verifies the JWT signature against the project's
 * published keys. getSession() is never used for this: it reads the cookie
 * without revalidating, and a cookie is attacker-controlled input.
 *
 * Roles come from the user_roles table rather than from JWT metadata. A token
 * issued before a role was revoked would still carry the old claim until it
 * refreshed, which is exactly the window you do not want on a permission check.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", claims.sub);

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    roles: (roleRows ?? []).map((r) => r.role),
  };
}

export function hasRole(user: SessionUser | null, ...roles: AppRole[]): boolean {
  if (!user) return false;
  return roles.some((role) => user.roles.includes(role));
}

/** Editors and admins. Mirrors app.is_editorial() in the database. */
export function isEditorial(user: SessionUser | null): boolean {
  return hasRole(user, "admin", "editor");
}

/**
 * Where a signed-in user belongs. An account with no role is a reader: they
 * have signed in, which grants them following and newsletter preferences, and
 * nothing else.
 */
export function dashboardHomeFor(user: SessionUser): string {
  if (user.roles.includes("admin")) return "/admin";
  if (user.roles.includes("editor")) return "/desk";
  if (user.roles.includes("reviewer")) return "/review";
  if (user.roles.includes("author")) return "/contribute";
  return "/account";
}
