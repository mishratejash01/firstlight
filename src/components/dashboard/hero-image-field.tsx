"use client";

import Image from "next/image";
import { useState } from "react";

import { MediaUploadDialog } from "./media-upload-dialog";
import { cloudinaryImage } from "@/lib/media/transform";

/**
 * The lead image for an article.
 *
 * Stored as three separate fields rather than embedded in the body, because
 * the homepage, section fronts, search results and the OpenGraph card all need
 * the image independently of the article text. Pulling the first picture out of
 * the body at render time would break the moment a story led with a video or
 * had no picture at all.
 */
export function HeroImageField({
  initialUrl,
  initialAlt,
  initialCredit,
}: {
  initialUrl: string | null;
  initialAlt: string | null;
  initialCredit: string | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [alt, setAlt] = useState(initialAlt ?? "");
  const [credit, setCredit] = useState(initialCredit ?? "");
  const [showUpload, setShowUpload] = useState(false);

  // The dialog hands back Markdown; the pieces are pulled back out so the same
  // upload flow serves both the body and this field.
  function accept(markdown: string) {
    const match = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(markdown.trim());
    if (match) {
      setAlt(match[1]);
      setUrl(match[2]);
      if (match[3]) setCredit(match[3].replace(/^Credit:\s*/i, ""));
    }
    setShowUpload(false);
  }

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div>
      <p className="text-meta text-muted">Lead image</p>

      {url ? (
        <div className="mt-2">
          <div className="relative aspect-[16/9] w-full max-w-md overflow-hidden bg-hairline">
            <Image
              src={cloudinaryImage(url, "card") ?? url}
              alt={alt}
              fill
              sizes="440px"
              className="object-cover"
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-meta text-muted">
          No lead image yet. This is what appears on the front page and when the
          story is shared.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted"
        >
          {url ? "Replace lead image" : "Upload lead image"}
        </button>
        {url ? (
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setAlt("");
              setCredit("");
            }}
            className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted"
          >
            Remove
          </button>
        ) : null}
      </div>

      <input type="hidden" name="hero_image_url" value={url} />

      {url ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hero_image_alt" className="block text-meta text-muted">
              Image description (required for screen readers)
            </label>
            <input
              id="hero_image_alt"
              name="hero_image_alt"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="hero_image_credit" className="block text-meta text-muted">
              Credit
            </label>
            <input
              id="hero_image_credit"
              name="hero_image_credit"
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="hero_image_alt" value="" />
          <input type="hidden" name="hero_image_credit" value="" />
        </>
      )}

      {showUpload ? (
        <MediaUploadDialog onInsert={accept} onClose={() => setShowUpload(false)} />
      ) : null}
    </div>
  );
}
