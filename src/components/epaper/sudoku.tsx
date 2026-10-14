"use client";

import { useState } from "react";

import type { Sudoku as SudokuData } from "@/lib/epaper/puzzles";

/**
 * The day's sudoku. The given numbers are fixed; type 1 to 9 into the rest.
 * Check marks squares that are wrong, Reveal shows the solution.
 */
export function Sudoku({ puzzle }: { puzzle: SudokuData }) {
  const [entries, setEntries] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  const solved = puzzle.puzzle.every((given, i) => given || entries[i] === puzzle.solution[i]);

  return (
    <div className="ep-sudoku" data-no-swipe="">
      <div className="ep-sd-grid" role="grid" aria-label="Sudoku grid">
        {puzzle.puzzle.map((given, i) => {
          const row = Math.floor(i / 9);
          const col = i % 9;
          const edges = [
            col % 3 === 2 && col < 8 ? "ep-sd-right" : "",
            row % 3 === 2 && row < 8 ? "ep-sd-bottom" : "",
          ].join(" ");
          if (given) {
            return (
              <div key={i} className={`ep-sd-cell ep-sd-given ${edges}`}>
                {given}
              </div>
            );
          }
          const value = entries[i];
          const wrong = checked && value && value !== puzzle.solution[i];
          return (
            <div key={i} className={`ep-sd-cell ${edges} ${wrong ? "ep-sd-wrong" : ""}`}>
              <input
                value={value ?? ""}
                inputMode="numeric"
                maxLength={2}
                autoComplete="off"
                aria-label={`Row ${row + 1}, column ${col + 1}`}
                onChange={(event) => {
                  const digit = Number(event.target.value.replace(/[^1-9]/g, "").slice(-1));
                  setEntries((all) => {
                    const next = { ...all };
                    if (digit) next[i] = digit;
                    else delete next[i];
                    return next;
                  });
                  setChecked(false);
                }}
              />
            </div>
          );
        })}
      </div>
      {solved ? <p className="ep-puzzle-done">Solved.</p> : null}
      <div className="ep-puzzle-actions">
        <button type="button" className="ep-button" onClick={() => setChecked(true)}>
          Check
        </button>
        <button
          type="button"
          className="ep-button"
          onClick={() => {
            setEntries(Object.fromEntries(puzzle.solution.map((n, i) => [i, n])));
            setChecked(false);
          }}
        >
          Reveal
        </button>
        <button
          type="button"
          className="ep-button"
          onClick={() => {
            setEntries({});
            setChecked(false);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
