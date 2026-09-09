/**
 * Marks copy that has been drafted as a working placeholder and still needs a
 * responsible human to approve it.
 *
 * Deliberately visible on the page rather than left as a code comment. A
 * policy page that says something untrue about how the newsroom operates is a
 * credibility problem, and the only reliable way to stop draft text quietly
 * becoming published policy is to make the draft state impossible to miss.
 */
export function EditorialNotice({ children }: { children: React.ReactNode }) {
  return (
    <aside className="my-6 border-l-2 border-signal pl-4">
      <p className="text-meta font-semibold text-signal">
        Draft — requires sign-off before launch
      </p>
      <p className="mt-1 text-meta leading-relaxed text-muted">{children}</p>
    </aside>
  );
}
