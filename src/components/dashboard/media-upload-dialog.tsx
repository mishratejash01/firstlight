"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { uploadMedia } from "@/app/contribute/media-actions";

/**
 * Uploads a file to Cloudinary and returns the Markdown to insert.
 *
 * Rendered through a portal into document.body, and containing no <form> of its
 * own. Both matter: this dialog is opened from inside the article editor's own
 * form, and HTML forbids nested forms — the browser silently drops the inner
 * one, so a submit button here submitted the ARTICLE form instead and the
 * upload never fired. The portal moves it out of that DOM subtree entirely, so
 * the bug cannot come back if someone later adds a form element here.
 *
 * Alt text is required for images rather than optional. An image published
 * without a description is invisible to anyone using a screen reader, and the
 * only moment when someone reliably knows what the picture shows is while they
 * are uploading it.
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

  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, unless an upload is in flight — abandoning midway would
  // leave a file in the media account with nothing pointing at it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !uploading) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, uploading]);

  const isVideo = file ? file.type.startsWith("video/") : false;

  async function upload() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (!isVideo && !altText.trim()) {
      setError("Describe the image so screen reader users know what it shows.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("alt_text", altText);
    formData.set("credit", credit);

    try {
      const result = await uploadMedia(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Credit is folded into the caption so it travels with the image into the
      // article body, rather than living only in the media record where a
      // reader would never see it.
      const fullCaption = [
        caption.trim(),
        credit.trim() ? `Credit: ${credit.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const alt = altText.replace(/[[\]]/g, "");
      onInsert(
        fullCaption
          ? `![${alt}](${result.url} "${fullCaption.replace(/"/g, "'")}")`
          : `![${alt}](${result.url})`,
      );
    } catch (cause) {
      // A server action that throws — a payload over the limit, a network drop —
      // otherwise fails silently and the dialog just sits there.
      setError(
        cause instanceof Error
          ? `Upload failed: ${cause.message}`
          : "Upload failed. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  // The dialog only renders after a click, so document always exists by then.
  // The guard is for safety rather than a real SSR path, and avoids the mount
  // flag that would otherwise mean a setState inside an effect.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        onKeyDown={(event) => {
          // Enter in a text field would otherwise reach the editor's form and
          // save the draft instead of uploading.
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            event.stopPropagation();
            if (!uploading) void upload();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-heading"
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border border-hairline bg-paper p-6"
      >
        <h2 id="upload-heading" className="font-serif text-section text-ink">
          Add an image or video
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="media-file" className="block text-meta text-muted">
              File — JPEG, PNG, WebP, AVIF or GIF up to 10MB, or MP4, WebM or MOV up to 100MB
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
            {file ? (
              <p className="mt-1 text-meta text-muted">
                {file.name} — {(file.size / (1024 * 1024)).toFixed(1)}MB
              </p>
            ) : null}
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
            <p role="alert" className="text-meta text-signal">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={upload}
              disabled={uploading || !file}
              className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload and insert"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          {uploading ? (
            <p className="text-meta text-muted">
              Large files can take a moment. Do not close this window.
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
