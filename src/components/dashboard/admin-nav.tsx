import Link from "next/link";

const PAGES = [
  { href: "/admin", label: "Overview", hint: "What needs attention" },
  { href: "/admin/people", label: "People", hint: "Accounts and access" },
  { href: "/admin/sections", label: "Sections", hint: "What appears in the menu" },
  { href: "/admin/sources", label: "Wire feeds", hint: "Sources and licences" },
  { href: "/admin/feeds", label: "Feed switches", hint: "Direct feeds, on and off" },
  { href: "/admin/topics", label: "AI topics", hint: "Automatic publishing" },
  { href: "/admin/trends", label: "Trending", hint: "What people are searching" },
  { href: "/admin/events", label: "Events", hint: "What is breaking, and why" },
  { href: "/admin/audience", label: "Audience", hint: "Readers and subscribers" },
] as const;

/**
 * Administration sub-navigation.
 *
 * The dashboard was one long scroll mixing four unrelated jobs — granting
 * access, reordering the site menu, reading retention figures — so nothing was
 * findable and everything looked equally urgent. Splitting by task means each
 * page answers one question, and the hint under each label says which.
 */
export function AdminNav({ current }: { current: string }) {
  return (
    <nav aria-label="Administration" className="border-b border-hairline">
      <ul className="-mx-4 flex gap-6 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PAGES.map((page) => {
          const active = page.href === current;
          return (
            <li key={page.href} className="shrink-0">
              <Link
                href={page.href}
                aria-current={active ? "page" : undefined}
                className="block"
              >
                <span
                  className={
                    active
                      ? "block text-body font-semibold text-accent"
                      : "block text-body text-ink hover:text-accent"
                  }
                >
                  {page.label}
                </span>
                <span className="mt-0.5 block text-meta text-muted">{page.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
