import Image from "next/image";
import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import { cloudinaryImage } from "@/lib/media/transform";
import type { CaseStudyCardData } from "@/lib/queries/case-studies";

export function caseStudyHref(item: Pick<CaseStudyCardData, "slug" | "categories">): string {
  return `/${item.categories.slug}/${item.slug}`;
}

/** A company or institution mark, which must be shown whole, not cropped like a photograph. */
export function isLogoPicture(item: { hero_image_alt?: string | null; hero_image_credit?: string | null }): boolean {
  return /\blogo\b/i.test(item.hero_image_alt ?? "") || /\blogo\b/i.test(item.hero_image_credit ?? "");
}

/** The picture in a frame: photographs fill it, marks sit whole on a tinted ground. */
export function CaseStudyPicture({
  item,
  preset,
  sizes,
  aspect = "aspect-[4/3]",
  priority = false,
  ground = "bg-wash",
}: {
  item: Pick<CaseStudyCardData, "hero_image_url" | "hero_image_alt"> & { hero_image_credit?: string | null };
  preset: "thumb" | "card" | "hero";
  sizes: string;
  aspect?: string;
  priority?: boolean;
  /** The frame's colour: the tinted wash, or paper when the frame already sits on the wash. */
  ground?: "bg-wash" | "bg-paper";
}) {
  if (!item.hero_image_url) {
    return <div aria-hidden="true" className={`${aspect} w-full rounded-media ${ground}`} />;
  }
  const logo = isLogoPicture(item);
  return (
    <div className={`relative ${aspect} w-full overflow-hidden rounded-media ${ground}`}>
      <Image
        src={cloudinaryImage(item.hero_image_url, preset) ?? item.hero_image_url}
        alt=""
        fill
        priority={priority}
        sizes={sizes}
        className={logo ? "object-contain p-[12%] mix-blend-multiply dark:mix-blend-normal" : "object-cover"}
      />
    </div>
  );
}

/** The line under a case study's question: its subject and when it was last reviewed. */
export function CaseStudyMeta({
  item,
  subjectName,
  className = "",
  lead = false,
}: {
  item: Pick<CaseStudyCardData, "reviewed_at" | "published_at">;
  subjectName?: string | null;
  className?: string;
  lead?: boolean;
}) {
  const reviewed = item.reviewed_at ?? item.published_at;
  return (
    <p className={`font-label text-meta text-muted ${className}`}>
      {lead ? (
        <>
          <span className="font-semibold text-accent">Case study</span>
          <span aria-hidden="true" className="mx-2">
            &middot;
          </span>
        </>
      ) : null}
      {subjectName ? (
        <>
          <span className="text-ink">{subjectName}</span>
          <span aria-hidden="true" className="mx-2">
            &middot;
          </span>
        </>
      ) : null}
      {reviewed ? <>Reviewed {formatDate(reviewed)}</> : null}
    </p>
  );
}

/**
 * A case study in a list: the question, the one-sentence answer under it, and
 * when it was last reviewed. The question is the headline; a reader decides
 * from it whether they want the answer.
 *
 * "lead" is the dossier at the top of the library and the front page's shelf;
 * "card" has a picture; "row" is a picture beside a question; "line" is text
 * only, for the dense list that carries the library while it is small.
 */
export function CaseStudyCard({
  item,
  subjectName,
  variant = "card",
}: {
  item: CaseStudyCardData;
  subjectName?: string | null;
  variant?: "lead" | "card" | "row" | "line";
}) {
  const href = caseStudyHref(item);
  const answer = item.standfirst ?? item.summary;

  if (variant === "line") {
    return (
      <article className="group py-5">
        <CaseStudyMeta item={item} subjectName={subjectName} />
        <h3 className="mt-1.5 font-headline text-[1.25rem] leading-[1.22] text-ink">
          <Link href={href} className="group-hover:text-accent">
            {item.headline}
          </Link>
        </h3>
        {answer ? <p className="mt-2 line-clamp-2 text-body leading-relaxed text-muted">{answer}</p> : null}
      </article>
    );
  }

  if (variant === "row") {
    return (
      <article className="group flex items-start gap-4">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="w-28 shrink-0 sm:w-32">
          <CaseStudyPicture item={item} preset="thumb" sizes="128px" />
        </Link>
        <div className="min-w-0">
          <h3 className="font-headline text-[1.0625rem] leading-[1.28] text-ink">
            <Link href={href} className="group-hover:text-accent">
              {item.headline}
            </Link>
          </h3>
          <CaseStudyMeta item={item} subjectName={subjectName} className="mt-1.5" />
        </div>
      </article>
    );
  }

  if (variant === "lead") {
    return (
      <article className="group grid gap-6 rounded-panel bg-wash p-5 sm:p-7 lg:grid-cols-12 lg:gap-10 lg:p-9">
        <div className="lg:col-span-7 lg:self-center">
          <CaseStudyMeta item={item} subjectName={subjectName} lead />
          <h2 className="headline-lg mt-3 text-[1.875rem] leading-[1.08] text-ink sm:text-[2.375rem]">
            <Link href={href} className="group-hover:text-accent">
              {item.headline}
            </Link>
          </h2>
          {answer ? <p className="mt-4 max-w-[36rem] font-dek text-[1.125rem] leading-[1.5] text-ink">{answer}</p> : null}
          <p className="mt-6">
            <Link
              href={href}
              className="inline-block rounded-control border border-ink px-4 py-2 font-label text-meta font-semibold text-ink group-hover:border-accent group-hover:text-accent"
            >
              Read the case study
            </Link>
          </p>
        </div>
        <Link href={href} tabIndex={-1} aria-hidden="true" className="lg:col-span-5">
          <CaseStudyPicture item={item} preset="hero" priority sizes="(max-width: 1024px) calc(100vw - 72px), 440px" ground="bg-paper" />
        </Link>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <CaseStudyPicture item={item} preset="card" sizes="(max-width: 640px) calc(100vw - 32px), 320px" />
      </Link>
      <CaseStudyMeta item={item} subjectName={subjectName} className="mt-4" />
      <h3 className="mt-2 font-headline text-[1.15rem] leading-[1.22] text-ink sm:text-headline">
        <Link href={href} className="group-hover:text-accent">
          {item.headline}
        </Link>
      </h3>
      {answer ? <p className="mt-2 line-clamp-3 text-body leading-relaxed text-muted">{answer}</p> : null}
    </article>
  );
}
