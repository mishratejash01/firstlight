import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * Shared shell for the policy and about pages: one column, body measure.
 * `wide` gives a page the full page width for columns of its own (the
 * standing documents' contents and news beside their clauses); the page lays
 * out those columns itself.
 * `hideTitle` keeps the heading for screen readers and search engines but
 * does not show it.
 */
export function StaticPage({
  title,
  standfirst,
  wide = false,
  hideTitle = false,
  children,
}: {
  title: string;
  standfirst?: string;
  wide?: boolean;
  hideTitle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="route-enter mx-auto max-w-page px-4 sm:px-6">
        <div className={`mx-auto py-10 ${wide ? "" : "max-w-measure"}`}>
          <h1 className={hideTitle ? "sr-only" : "text-hero leading-tight text-ink"}>
            {title}
          </h1>
          {standfirst ? (
            <p
              className={`max-w-measure text-lead leading-relaxed text-muted ${
                hideTitle ? "" : "mt-3"
              }`}
            >
              {standfirst}
            </p>
          ) : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
