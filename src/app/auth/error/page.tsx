import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign-in problem",
  robots: { index: false, follow: false },
};

// Deliberately vague about the cause. A sign-in error page that distinguishes
// "no such account" from "wrong credentials" is an account-enumeration oracle.
const REASONS: Record<string, string> = {
  missing_code: "The sign-in link was incomplete.",
  exchange_failed: "The sign-in link had already been used, or it expired.",
};

export default async function AuthErrorPage(props: PageProps<"/auth/error">) {
  const params = await props.searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const detail = REASONS[reason] ?? "Something went wrong during sign-in.";

  return (
    <main className="route-enter mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-[1.75rem] leading-tight text-ink">
        Sign-in problem
      </h1>
      <p className="mt-3 text-body text-muted">{detail}</p>
      <Link
        href="/login"
        className="mt-8 inline-block text-body text-accent underline underline-offset-4"
      >
        Try again
      </Link>
    </main>
  );
}
