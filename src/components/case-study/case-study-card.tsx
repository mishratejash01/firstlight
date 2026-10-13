import Image from "next/image";
import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import { cloudinaryImage } from "@/lib/media/transform";
import type { CaseStudyCardData } from "@/lib/queries/case-studies";

export function caseStudyHref(item: Pick<CaseStudyCardData, "slug" | "categories">): string {
  return `/${item.categories.slug}/${item.slug}`;
}

/** The line under a case study's question: its subject and when it was last reviewed. */
export function CaseStudyMeta({
  item,
  subjectName,
  className = "",
}: {
  item: Pick<CaseStudyCardData, "reviewed_at" | "published_at">;
  subjectName?: string | null;
  className?: string;
}) {
  const reviewed = item.reviewed_at ?? item.published_at;
  return (
    <p className={`font-label text-meta text-muted ${className}`}>
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
 */
export function CaseStudyCard({
  item,
  subjectName,
  variant = "card",
}: {
  item: CaseStudyCardData;
  subjectName?: string | null;
  variant?: "lead" | "card" | "row";
}) {
  const href = caseStudyHref(item);
  const answer = item.standfirst ?? item.summary;

  if (variant === "row") {
    return (
      <article className="group flex items-start gap-4">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-media bg-wash sm:w-32">
          {item.hero_image_url ? (
            <Image src={cloudinaryImage(item.hero_image_url, "thumb") ?? item.hero_image_url} alt="" fill sizes="128px" className="object-cover" />
          ) : null}
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
      <article className="group grid gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[16/9] w-full overflow-hidden rounded-media bg-wash">
            {item.hero_image_url ? (
              <Image
                src={cloudinaryImage(item.hero_image_url, "hero") ?? item.hero_image_url}
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) calc(100vw - 32px), 720px"
                className="object-cover"
              />
            ) : null}
          </Link>
        </div>
        <div className="lg:col-span-5 lg:self-center">
          <CaseStudyMeta item={item} subjectName={subjectName} />
          <h2 className="mt-3 font-headline text-[1.75rem] leading-[1.12] tracking-[-0.015em] text-ink sm:text-[2.25rem]">
            <Link href={href} className="group-hover:text-accent">
              {item.headline}
            </Link>
          </h2>
          {answer ? <p className="mt-4 font-dek text-[1.125rem] leading-[1.5] text-ink">{answer}</p> : null}
          <p className="mt-5">
            <Link href={href} className="font-label text-meta text-accent underline-offset-4 hover:underline">
              Read the case study
            </Link>
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/3] w-full overflow-hidden rounded-media bg-wash">
        {item.hero_image_url ? (
          <Image src={cloudinaryImage(item.hero_image_url, "card") ?? item.hero_image_url} alt="" fill sizes="(max-width: 640px) calc(100vw - 32px), 320px" className="object-cover" />
        ) : null}
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
