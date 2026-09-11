"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * A search field that suggests as you type.
 *
 * Still a real GET form to /search underneath, so it works before hydration
 * and without JavaScript; the suggestions are an enhancement layered on top.
 * Suggestions come from the same full-text search the results page uses, so
 * what appears here is what the reader will find there. Arrow keys move
 * through them, Enter opens one, Escape closes the list.
 */

type Suggestion = { headline: string; href: string; section: string | null };

const MIN_CHARS = 2;
const DEBOUNCE_MS = 180;

function Glyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.75 12.75 17 17" />
    </svg>
  );
}

export function SearchField({
  variant = "compact",
  defaultValue = "",
}: {
  /** compact: the flag; full: the search page. */
  variant?: "compact" | "full";
  defaultValue?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
        setOpen(data.suggestions.length > 0);
        setActive(-1);
      } catch {
        // Aborted or offline: the form still submits.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      setOpen(false);
      router.push(suggestions[active].href);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const compact = variant === "compact";

  return (
    <div ref={boxRef} className={compact ? "relative" : "relative max-w-xl"}>
      <form
        action="/search"
        method="get"
        role="search"
        className={
          compact
            ? "flex items-center gap-2 border-b border-hairline pb-0.5"
            : "flex flex-col gap-2 sm:flex-row"
        }
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search articles
        </label>
        <input
          id={`${listId}-input`}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={compact ? "Search" : "Search reporting"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={
            compact
              ? "w-36 bg-transparent text-meta text-ink placeholder:text-muted focus:outline-none"
              : "min-w-0 flex-1 rounded-control border border-hairline bg-paper px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          }
        />
        {compact ? (
          <button type="submit" aria-label="Search" className="text-ink hover:text-accent">
            <Glyph />
          </button>
        ) : (
          <button
            type="submit"
            className="rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90"
          >
            Search
          </button>
        )}
      </form>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={
            (compact ? "absolute right-0 top-full z-50 mt-2 w-80 " : "absolute left-0 top-full z-50 mt-2 w-full ") +
            "border border-hairline bg-paper py-1"
          }
        >
          {suggestions.map((item, index) => (
            <li key={item.href} role="option" aria-selected={index === active}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(index)}
                className={
                  "block px-3 py-2 text-meta " +
                  (index === active ? "bg-hairline/40 text-accent" : "text-ink hover:text-accent")
                }
              >
                {item.headline}
                {item.section ? <span className="ml-2 text-muted">{item.section}</span> : null}
              </Link>
            </li>
          ))}
          <li className="border-t border-hairline">
            <Link
              href={`/search?q=${encodeURIComponent(value.trim())}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-meta text-muted hover:text-accent"
            >
              All results for “{value.trim()}”
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
