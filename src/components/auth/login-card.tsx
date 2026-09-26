import Image from "next/image";

import { SITE_NAME } from "@/lib/site";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

/**
 * The sign-in card.
 *
 * One card, used in both places signing in can start: dropped under the Sign in
 * button in the masthead, and standing on its own at /login for the redirects
 * that have nowhere else to land — a guard turning someone away from /desk, or
 * a follow button pressed by a reader who is not signed in yet. Two copies of
 * this would drift, and the wording here is the only thing telling a reader
 * what an account actually gets them.
 *
 * Server-rendered apart from the button itself, which has to be a client
 * component to start the OAuth redirect.
 */
export function LoginCard({ next }: { next?: string }) {
  return (
    <div className="rounded-panel border border-hairline bg-paper p-6 shadow-[0_18px_40px_-28px_rgba(20,22,28,0.45)]">
      <div className="flex items-center gap-3">
        <Image
          src="/brand/dove.png"
          alt=""
          aria-hidden="true"
          width={256}
          height={256}
          className="h-9 w-9 shrink-0"
        />
        <div>
          <p className="font-label text-body font-semibold text-ink">Sign in</p>
          <p className="text-meta text-muted">{SITE_NAME}</p>
        </div>
      </div>

      <p className="mt-4 text-meta leading-relaxed text-ink">
        Sign in to follow topics and authors and manage your newsletters.
        Newsroom staff and contributors sign in here too.
      </p>

      <div className="mt-5">
        <GoogleSignInButton next={next} />
      </div>

      <p className="mt-5 border-t border-hairline pt-4 text-meta leading-relaxed text-muted">
        Signing in creates a reader account. Editorial access is granted
        separately by an administrator.
      </p>
    </div>
  );
}
