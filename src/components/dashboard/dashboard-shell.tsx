import { SITE_NAME } from "@/lib/site";
import Link from "next/link";

import type { SessionUser } from "@/lib/auth/roles";

/**
 * Chrome for every newsroom surface.
 *
 * The navigation is built from the roles the signed-in user actually holds, so
 * an author never sees a link to the desk. That is presentation only — the
 * pages themselves are guarded, and the database is guarded beneath them.
 */
export function DashboardShell({
  user,
  title,
  standfirst,
  actions,
  children,
}: {
  user: SessionUser;
  title: string;
  standfirst?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Only surfaces the person can actually use. "My work" was previously shown
  // to everyone, so a reader with no newsroom access saw a link that bounced
  // them straight back here — a dead end that made the whole area feel broken.
  const links: { href: string; label: string }[] = [];
  if (user.roles.includes("admin")) links.push({ href: "/admin", label: "Administration" });
  if (user.roles.includes("admin") || user.roles.includes("editor")) {
    links.push({ href: "/desk", label: "Desk" });
  }
  if (
    user.roles.includes("author") ||
    user.roles.includes("editor") ||
    user.roles.includes("admin")
  ) {
    links.push({ href: "/contribute", label: "My work" });
  }
  links.push({ href: "/account", label: "Your profile" });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="text-[1.2rem] font-semibold text-ink">
            {SITE_NAME}
          </Link>
          <div className="flex items-baseline gap-4">
            <span className="hidden text-meta text-muted sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-meta text-accent hover:underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav aria-label="Newsroom" className="border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <ul className="-mx-4 flex gap-5 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {links.map((link) => (
                <li key={link.href} className="shrink-0">
                  <Link href={link.href} className="text-meta text-ink hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      <main className="route-enter mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
          <div>
            <h1 className="text-[1.75rem] leading-tight text-ink">{title}</h1>
            {standfirst ? <p className="mt-1 text-meta text-muted">{standfirst}</p> : null}
          </div>
          {actions ? <div className="flex gap-3">{actions}</div> : null}
        </div>

        <div className="pt-6">{children}</div>
      </main>
    </div>
  );
}
