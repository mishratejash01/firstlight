import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/** Shared shell for the policy and about pages: one column, body measure. */
export function StaticPage({
  title,
  standfirst,
  children,
}: {
  title: string;
  standfirst?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="route-enter mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-measure py-10">
          <h1 className="font-serif text-hero leading-tight text-ink">{title}</h1>
          {standfirst ? (
            <p className="mt-3 text-lead leading-relaxed text-muted">{standfirst}</p>
          ) : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
