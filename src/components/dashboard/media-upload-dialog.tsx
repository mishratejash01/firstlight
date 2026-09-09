"use client";

import { useState } from "react";

import { uploadMedia } from "@/app/contribute/media-actions";

/**
 * Uploads a file to Cloudinary and returns the Markdown to insert.
 *
 * Alt text is a required field for images rather than an optional one. An
 * image published without a description is invisible to anyone using a screen
 * reader, and the only moment when someone reliably knows what the picture
 * shows is while they are uploading it.
 */
export function MediaUploadDialog({
  onInsert,
  onClose,
}: {
  onInsert: (markdown: string) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = file ? file.type.startsWith("video/") : false;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("alt_text", altText);
    formData.set("credit", credit);

    const result = await uploadMedia(formData);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Credit is appended to the caption so it travels with the image into the
    // article body, rather than living only in the media record where a reader
    // would never see it.
    const fullCaption = [caption.trim(), credit.trim() ? `Credit: ${credit.trim()}` : ""]
      .filter(Boolean)
      .join(" ");

    const alt = altText.replace(/[[\]]/g, "");
    onInsert(
      fullCaption
        ? `![${alt}](${result.url} "${fullCaption.replace(/"/g, "'")}")`
        : `![${alt}](${result.url})`,
    );
  }

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-heading"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border border-hairline bg-paper p-6"
      >
        <h2 id="upload-heading" className="font-serif text-section text-ink">
          Add an image or video
        </h2>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="media-file" className="block text-meta text-muted">
              File — JPEG, PNG, WebP, AVIF, GIF up to 10MB, or MP4, WebM, MOV up to 100MB
            </label>
            <input
              id="media-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              className={fieldClass}
            />
          </div>

          {!isVideo ? (
            <div>
              <label htmlFor="media-alt" className="block text-meta text-muted">
                Describe the image, for readers using a screen reader (required)
              </label>
              <input
                id="media-alt"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Sea wall at Rhoswen photographed at high tide"
                className={fieldClass}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="media-caption" className="block text-meta text-muted">
              Caption, shown under the image (optional)
            </label>
            <input
              id="media-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="media-credit" className="block text-meta text-muted">
              Credit (optional)
            </label>
            <input
              id="media-credit"
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
              placeholder="Reuters"
              className={fieldClass}
            />
          </div>

          {error ? (
            <p role="alert" className="text-meta text-signal">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={uploading}
              className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload and insert"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted"
            >
              Cancel
            </button>
          </div>

          {uploading ? (
            <p className="text-meta text-muted">
              Large files can take a moment. Do not close this window.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
