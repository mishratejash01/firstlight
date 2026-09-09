"use client";

import { useState } from "react";

import { MediaUploadDialog } from "./media-upload-dialog";

/**
 * Formatting controls for the body field.
 *
 * Operates on the textarea directly rather than replacing it with a rich-text
 * editor. A contenteditable surface stores browser-generated HTML, which is
 * untrusted input that then has to be sanitised on the way out forever; keeping
 * the source as Markdown means the renderer can refuse to emit markup at all.
 *
 * The buttons exist because expecting a journalist to remember Markdown syntax
 * is not a reasonable ask — the storage format being plain text should not mean
 * the writing experience is.
 */

type Wrap = { before: string; after: string; placeholder: string };

const CONTROLS: { label: string; title: string; wrap: Wrap }[] = [
  { label: "B", title: "Bold (Ctrl+B)", wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { label: "I", title: "Italic (Ctrl+I)", wrap: { before: "*", after: "*", placeholder: "italic text" } },
];

const BLOCKS: { label: string; title: string; prefix: string; placeholder: string }[] = [
  { label: "Heading", title: "Section heading", prefix: "## ", placeholder: "What happened" },
  { label: "Sub-heading", title: "Sub-heading", prefix: "### ", placeholder: "Detail" },
  { label: "List", title: "Bulleted list", prefix: "- ", placeholder: "First point" },
  { label: "Quote", title: "Block quote", prefix: "> ", placeholder: "Quoted words" },
];

export function EditorToolbar({ textareaId }: { textareaId: string }) {
  const [showUpload, setShowUpload] = useState(false);

  function field(): HTMLTextAreaElement | null {
    return document.getElementById(textareaId) as HTMLTextAreaElement | null;
  }

  /**
   * Replaces the current selection and restores it afterwards, so a writer can
   * bold a word and keep typing without hunting for the caret again.
   */
  function replaceSelection(build: (selected: string) => { text: string; selectStart: number; selectEnd: number }) {
    const el = field();
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end);
    const { text, selectStart, selectEnd } = build(selected);

    el.setRangeText(text, start, end, "end");
    el.focus();
    el.setSelectionRange(start + selectStart, start + selectEnd);

    // React does not see setRangeText, so the form value would stay stale.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyWrap(wrap: Wrap) {
    replaceSelection((selected) => {
      const inner = selected || wrap.placeholder;
      return {
        text: `${wrap.before}${inner}${wrap.after}`,
        selectStart: wrap.before.length,
        selectEnd: wrap.before.length + inner.length,
      };
    });
  }

  function applyBlock(prefix: string, placeholder: string) {
    replaceSelection((selected) => {
      const el = field();
      // Only add a leading newline when we are not already at the start of one,
      // so pressing Heading twice does not leave a blank line behind.
      const atLineStart =
        !el || el.selectionStart === 0 || el.value[el.selectionStart - 1] === "\n";
      const lead = atLineStart ? "" : "\n\n";
      const inner = selected || placeholder;
      return {
        text: `${lead}${prefix}${inner}`,
        selectStart: lead.length + prefix.length,
        selectEnd: lead.length + prefix.length + inner.length,
      };
    });
  }

  function insertLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;

    // Refuse anything that is not a real web address. javascript: in a link is
    // stripped by the renderer too, but there is no reason to store it.
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      window.alert("Links must start with https:// or /");
      return;
    }

    replaceSelection((selected) => {
      const label = selected || "link text";
      return {
        text: `[${label}](${url})`,
        selectStart: 1,
        selectEnd: 1 + label.length,
      };
    });
  }

  function insertMedia(markdown: string) {
    replaceSelection(() => {
      const el = field();
      const atLineStart =
        !el || el.selectionStart === 0 || el.value[el.selectionStart - 1] === "\n";
      const text = `${atLineStart ? "" : "\n\n"}${markdown}\n\n`;
      return { text, selectStart: text.length, selectEnd: text.length };
    });
    setShowUpload(false);
  }

  const buttonClass =
    "rounded-control border border-hairline px-2.5 py-1.5 text-meta text-ink hover:border-muted";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border border-hairline border-b-0 bg-paper p-2">
        {CONTROLS.map((control) => (
          <button
            key={control.label}
            type="button"
            title={control.title}
            onClick={() => applyWrap(control.wrap)}
            className={`${buttonClass} ${control.label === "B" ? "font-semibold" : "italic"}`}
          >
            {control.label}
          </button>
        ))}

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-hairline" />

        {BLOCKS.map((block) => (
          <button
            key={block.label}
            type="button"
            title={block.title}
            onClick={() => applyBlock(block.prefix, block.placeholder)}
            className={buttonClass}
          >
            {block.label}
          </button>
        ))}

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-hairline" />

        <button type="button" onClick={insertLink} className={buttonClass} title="Insert a link">
          Link
        </button>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className={buttonClass}
          title="Upload an image or video"
        >
          Image or video
        </button>
      </div>

      {showUpload ? (
        <MediaUploadDialog
          onInsert={insertMedia}
          onClose={() => setShowUpload(false)}
        />
      ) : null}
    </>
  );
}
