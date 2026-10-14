"use client";

import { useState } from "react";

import type { WordSearch as WordSearchData } from "@/lib/epaper/puzzles";

/**
 * The day's word search: names and words from the edition's headlines,
 * hidden across, down, diagonally and backwards. Press a word's first letter
 * and then its last; a word found is marked in the grid and crossed off.
 */
export function WordSearch({ puzzle }: { puzzle: WordSearchData }) {
  const [found, setFound] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<[number, number] | null>(null);

  const foundCells = new Set(
    puzzle.words.filter((w) => found.has(w.word)).flatMap((w) => w.cells.map(([r, c]) => `${r},${c}`)),
  );

  const pick = (row: number, col: number) => {
    if (!start) {
      setStart([row, col]);
      return;
    }
    const [r0, c0] = start;
    setStart(null);
    const match = puzzle.words.find((w) => {
      const first = w.cells[0];
      const last = w.cells[w.cells.length - 1];
      const forward = first[0] === r0 && first[1] === c0 && last[0] === row && last[1] === col;
      const backward = last[0] === r0 && last[1] === c0 && first[0] === row && first[1] === col;
      return forward || backward;
    });
    if (match) setFound((all) => new Set(all).add(match.word));
  };

  return (
    <div className="ep-wordsearch" data-no-swipe="">
      <div
        className="ep-ws-grid"
        style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Word search grid"
      >
        {puzzle.rows.flatMap((line, row) =>
          [...line].map((letter, col) => {
            const k = `${row},${col}`;
            const isStart = start?.[0] === row && start?.[1] === col;
            return (
              <button
                key={k}
                type="button"
                aria-label={`${letter}, row ${row + 1}, column ${col + 1}`}
                aria-pressed={isStart}
                className={[
                  "ep-ws-cell",
                  foundCells.has(k) ? "ep-ws-found" : "",
                  isStart ? "ep-ws-start" : "",
                ].join(" ")}
                onClick={() => pick(row, col)}
              >
                {letter}
              </button>
            );
          }),
        )}
      </div>
      <ul className="ep-ws-words">
        {puzzle.words.map((w) => (
          <li key={w.word} className={found.has(w.word) ? "ep-ws-done" : undefined}>
            {w.word}
          </li>
        ))}
      </ul>
      <div className="ep-puzzle-actions">
        <button
          type="button"
          className="ep-button"
          onClick={() => setFound(new Set(puzzle.words.map((w) => w.word)))}
        >
          Reveal
        </button>
        <button type="button" className="ep-button" onClick={() => setFound(new Set())}>
          Clear
        </button>
      </div>
    </div>
  );
}
