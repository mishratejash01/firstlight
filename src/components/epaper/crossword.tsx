"use client";

import { useId, useMemo, useState } from "react";

import type {
  Crossword as CrosswordData,
  CrosswordClue,
} from "@/lib/epaper/puzzles";

/**
 * The day's crossword, playable on the page.
 *
 * Type into the grid: the cursor moves along the answer, Backspace steps
 * back, the arrow keys move around, and pressing a square again (or Space)
 * turns from across to down. Pressing a clue goes to its first square. Check
 * marks wrong letters, Reveal fills the grid, Clear starts again.
 */

type Direction = "across" | "down";

function key(row: number, col: number) {
  return `${row},${col}`;
}

/** The squares an answer covers. */
function cellsOf(clue: CrosswordClue, direction: Direction): string[] {
  return Array.from({ length: clue.length }, (_, i) =>
    direction === "across"
      ? key(clue.row, clue.col + i)
      : key(clue.row + i, clue.col),
  );
}

export function Crossword({ puzzle }: { puzzle: CrosswordData }) {
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [active, setActive] = useState<{ row: number; col: number }>(() => {
    const first = puzzle.across[0] ?? puzzle.down[0];
    return { row: first.row, col: first.col };
  });
  const [direction, setDirection] = useState<Direction>(
    puzzle.across.length ? "across" : "down",
  );
  const [checked, setChecked] = useState(false);
  // Squares are found by id when the cursor moves; one prefix per grid on the page.
  const prefix = useId();
  const idOf = (k: string) => `${prefix}-${k.replace(",", "-")}`;

  const isOpen = (row: number, col: number) =>
    row >= 0 &&
    col >= 0 &&
    row < puzzle.height &&
    col < puzzle.width &&
    puzzle.rows[row][col] !== "#";

  // Which answer each square belongs to, in each direction.
  const owner = useMemo(() => {
    const map: Record<
      string,
      { across?: CrosswordClue; down?: CrosswordClue }
    > = {};
    for (const clue of puzzle.across)
      for (const k of cellsOf(clue, "across")) (map[k] ??= {}).across = clue;
    for (const clue of puzzle.down)
      for (const k of cellsOf(clue, "down")) (map[k] ??= {}).down = clue;
    return map;
  }, [puzzle]);

  const here = owner[key(active.row, active.col)] ?? {};
  // A square in only one answer always follows that answer.
  const heading: Direction = here[direction]
    ? direction
    : here.across
      ? "across"
      : "down";
  const current = here[heading];
  const highlighted = new Set(current ? cellsOf(current, heading) : []);

  const focus = (row: number, col: number) => {
    setActive({ row, col });
    document.getElementById(idOf(key(row, col)))?.focus();
  };

  const step = (row: number, col: number, by: number, along: Direction) => {
    const r = row + (along === "down" ? by : 0);
    const c = col + (along === "across" ? by : 0);
    if (isOpen(r, c)) focus(r, c);
  };

  const choose = (row: number, col: number) => {
    if (row === active.row && col === active.col) {
      const other = heading === "across" ? "down" : "across";
      if (owner[key(row, col)]?.[other]) setDirection(other);
    }
    setActive({ row, col });
  };

  const write = (row: number, col: number, value: string) => {
    const letter = value
      .replace(/[^a-z]/gi, "")
      .slice(-1)
      .toUpperCase();
    setLetters((all) => ({ ...all, [key(row, col)]: letter }));
    setChecked(false);
    if (letter) step(row, col, 1, heading);
  };

  const onKey = (event: React.KeyboardEvent, row: number, col: number) => {
    const moves: Record<string, [number, number, Direction]> = {
      ArrowRight: [0, 1, "across"],
      ArrowLeft: [0, -1, "across"],
      ArrowDown: [1, 0, "down"],
      ArrowUp: [-1, 0, "down"],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setDirection(move[2]);
      step(row, col, move[0] || move[1], move[2]);
    } else if (event.key === "Backspace" && !letters[key(row, col)]) {
      event.preventDefault();
      step(row, col, -1, heading);
    } else if (event.key === " ") {
      event.preventDefault();
      choose(row, col);
    }
  };

  const reveal = () => {
    const all: Record<string, string> = {};
    puzzle.rows.forEach((line, row) =>
      [...line].forEach((letter, col) => {
        if (letter !== "#") all[key(row, col)] = letter;
      }),
    );
    setLetters(all);
    setChecked(false);
  };

  const clueList = (title: string, clues: CrosswordClue[], dir: Direction) => (
    <div>
      <h4 className="ep-puzzle-subhead">{title}</h4>
      <ol className="ep-clues">
        {clues.map((clue) => {
          const on = current === clue && heading === dir;
          return (
            <li key={`${dir}-${clue.number}`}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                className={on ? "ep-clue ep-clue-on" : "ep-clue"}
                onClick={() => {
                  setDirection(dir);
                  focus(clue.row, clue.col);
                }}
              >
                <b>{clue.number}</b> {clue.clue}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <div className="ep-crossword" data-no-swipe="">
      <div className="ep-cw-board">
        <div
          className="ep-cw-grid"
          style={{
            gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`,
          }}
          role="grid"
          aria-label="Crossword grid"
        >
          {puzzle.rows.flatMap((line, row) =>
            [...line].map((answer, col) => {
              const k = key(row, col);
              if (answer === "#")
                return (
                  <div key={k} className="ep-cw-block" aria-hidden="true" />
                );
              const value = letters[k] ?? "";
              const wrong = checked && value && value !== answer;
              const isActive = row === active.row && col === active.col;
              return (
                <div
                  key={k}
                  className={[
                    "ep-cw-cell",
                    highlighted.has(k) ? "ep-cw-word" : "",
                    isActive ? "ep-cw-active" : "",
                    wrong ? "ep-cw-wrong" : "",
                  ].join(" ")}
                >
                  {puzzle.numbers[k] ? (
                    <span className="ep-cw-number">{puzzle.numbers[k]}</span>
                  ) : null}
                  <input
                    id={idOf(k)}
                    value={value}
                    aria-label={`Row ${row + 1}, column ${col + 1}`}
                    maxLength={2}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    onFocus={() => setActive({ row, col })}
                    onClick={() => choose(row, col)}
                    onKeyDown={(event) => onKey(event, row, col)}
                    onChange={(event) => write(row, col, event.target.value)}
                  />
                </div>
              );
            }),
          )}
        </div>

        {current ? (
          <p className="ep-cw-current">
            <b>
              {current.number} {heading}
            </b>{" "}
            {current.clue}
          </p>
        ) : null}

        <div className="ep-puzzle-actions">
          <button
            type="button"
            className="ep-button"
            onClick={() => setChecked(true)}
          >
            Check
          </button>
          <button type="button" className="ep-button" onClick={reveal}>
            Reveal
          </button>
          <button
            type="button"
            className="ep-button"
            onClick={() => {
              setLetters({});
              setChecked(false);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Beside the grid on a wide page, under it on a narrow one. */}
      <div className="ep-clue-lists">
        {clueList("Across", puzzle.across, "across")}
        {clueList("Down", puzzle.down, "down")}
      </div>
    </div>
  );
}
