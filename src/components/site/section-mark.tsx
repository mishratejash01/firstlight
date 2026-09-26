/**
 * A section's mark, beside its written name.
 *
 * Drawn as a background rather than an <img>: the mark is decoration, the name
 * next to it says everything it does, so it is hidden from screen readers and
 * has nothing to describe. As an image it had to carry an empty description,
 * which search tools count against the page as an image without one; as a
 * background it is what it is, a picture on the page's surface. The size
 * comes from the classes passed in, so the box is fixed before the picture
 * arrives and nothing shifts when it does.
 */
export function SectionMark({ src, className = "" }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 bg-contain bg-center bg-no-repeat ${className}`}
      style={{ backgroundImage: `url("${src}")` }}
    />
  );
}
