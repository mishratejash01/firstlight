/**
 * Placeholder homepage.
 *
 * Replaced wholesale in Phase 4 by the database-driven homepage (hero,
 * secondary rail, category shelves). Nothing here is content — it is scaffold
 * microcopy, so there is no hardcoded editorial to strip out later.
 */
export default function Home() {
  return (
    <main className="route-enter mx-auto max-w-measure px-6 py-24">
      <h1 className="text-hero text-ink">Newswebsite</h1>
      <p className="mt-4 text-lead text-muted">
        Scaffold in place. The public site is built in Phase 4 and reads
        entirely from the database.
      </p>
    </main>
  );
}
