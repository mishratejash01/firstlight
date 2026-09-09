import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { dashboardHomeFor, getSessionUser } from "@/lib/auth/roles";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  // A sign-in page has no business in a search index.
  robots: { index: false, follow: false },
};

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
      <h1 className="font-serif text-[1.75rem] leading-tight text-ink">Sign in</h1>

      <p className="mt-3 text-body text-muted">
        Newsroom staff and contributors sign in here. Readers can sign in to
        follow topics and manage newsletters.
      </p>

      <div className="mt-8">
        <GoogleSignInButton next={next || undefined} />
      </div>

      <p className="mt-8 border-t border-hairline pt-6 text-meta text-muted">
        Signing in creates a reader account. Editorial access is granted
        separately by an administrator.
      </p>
    </main>
  );
}
