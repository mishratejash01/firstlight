"use client";

import { useState } from "react";

/**
 * A YouTube video inside a story, loaded only when the reader asks for it.
 *
 * Until then it is the video's own thumbnail with a play button: a YouTube
 * player costs about a megabyte of script and sets Google's cookies the moment
 * it loads, and most readers of a story never press play. Pressing play swaps
 * in the player from YouTube's privacy-enhanced domain, already playing, so it
 * still takes a single press.
 *
 * `start` (seconds) opens a long recording, such as a four-hour live stream,
 * at the moment a story quotes, rather than at its first minute.
 */
export function YouTubeEmbed({ id, title, start }: { id: string; title: string; start?: number }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="aspect-video w-full rounded-media bg-ink"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative block aspect-video w-full overflow-hidden rounded-media bg-ink"
      aria-label={`Play video: ${title}`}
    >
      {/* YouTube's own thumbnail, served by YouTube; the site's image loader
          only handles the paper's media library. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/80 text-paper transition-colors group-hover:bg-signal">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
