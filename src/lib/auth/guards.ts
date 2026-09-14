import "server-only";

import { redirect } from "next/navigation";

import { getSessionUser, isEditorial, type SessionUser } from "@/lib/auth/roles";

/**
 * Route guards for newsroom surfaces.
 *
 * These are a convenience for the reader, not the security boundary. A guard
 * decides which page to render; Row Level Security decides which rows exist.
 * If a guard were ever removed by mistake, an author reaching the editor desk
 * would still see nothing they were not entitled to, because the database
 * refuses the rows rather than the page refusing the visit.
 */

export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireEditorial(returnTo: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!isEditorial(user)) redirect("/account");
  return user;
}

export async function requireAdmin(returnTo: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!user.roles.includes("admin")) redirect("/account");
  return user;
}

/** Reviewers, and the editorial roles, which can always review. */
export async function requireReviewer(returnTo: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!user.roles.includes("reviewer") && !isEditorial(user)) redirect("/account");
  return user;
}

export async function requireAuthor(returnTo: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  // Editors file copy too, so editorial roles reach the contributor surface.
  if (!user.roles.includes("author") && !isEditorial(user)) redirect("/account");
  return user;
}
