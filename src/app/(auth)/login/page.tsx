import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LoginCard } from "@/components/auth/login-card";
import { dashboardHomeFor, getSessionUser } from "@/lib/auth/roles";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  // A sign-in page has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * Where a redirect lands, not where a reader chooses to go.
 *
 * Signing in from the masthead opens the card in place; nobody is sent here for
 * that any more. This route exists for the cases where a redirect is the only
 * option — a server guard turning someone away from /desk, the review route, a
 * follow button pressed before signing in — and it shows the very same card so
 * the two routes into an account do not look like two different products.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const rawNext = typeof params.next === "string" ? params.next : null;
  const next = rawNext ? safeRedirectPath(rawNext, "") : "";

  // Already signed in: send them where they belong rather than showing a
  // sign-in form they cannot use.
  const user = await getSessionUser();
  if (user) redirect(next || dashboardHomeFor(user));

  return (
    <main className="route-enter mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <LoginCard next={next || undefined} />
    </main>
  );
}
