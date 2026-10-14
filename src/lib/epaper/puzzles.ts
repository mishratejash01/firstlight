/**
 * The e-paper's puzzles: a crossword, a sudoku and a word search for each
 * edition.
 *
 * All three are made here, in code, from the edition's date and its own
 * headlines: no model, no puzzle service, nothing to pay for or wait on. The
 * date seeds the randomness, so an edition's puzzles are the same every time
 * it is opened and tomorrow's solutions can be printed from today's date.
 *
 * The crossword is the news itself. Its answers are names and words from the
 * day's headlines, and each clue is the headline with the answer left out:
 * "Nandan ________ dismisses AI job-loss fears as 'hogwash' (8)".
 */

/* --------------------------------------------------------------------------
   Randomness, seeded by the date.
   -------------------------------------------------------------------------- */

export type Random = () => number;

/** mulberry32: small, fast, and the same sequence for the same seed everywhere. */
export function seeded(text: string): Random {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* --------------------------------------------------------------------------
   Words from the day's headlines.
   -------------------------------------------------------------------------- */

const STOP_WORDS = new Set(
  (
    "about after again against amid among being below between could during every first from " +
    "have into more most next only other over said says says some than that their them then " +
    "there these they this those three through under until very what when where which while " +
    "will with would year years ahead back down after before since says calls urges amid " +
    "government minister ministers official officials india indian state states court police"
  ).split(" "),
);

export type HeadlineWord = { word: string; headline: string };

/**
 * Words worth asking for: names and places first (a capital letter inside the
 * headline, not just at its start), then other long words, four to ten
 * letters of A to Z only, each taken once.
 *
 * One word per headline: two answers from the same headline would each give
 * the other away in its clue, and one each brings more of the day's stories
 * into the puzzle. A second word from a headline is offered only after every
 * headline has given one.
 */
export function headlineWords(headlines: string[]): HeadlineWord[] {
  const names: HeadlineWord[] = [];
  const others: HeadlineWord[] = [];
  const seen = new Set<string>();
  for (const headline of headlines) {
    const tokens = headline.split(/[^A-Za-z]+/).filter(Boolean);
    tokens.forEach((token, index) => {
      const word = token.toUpperCase();
      if (word.length < 4 || word.length > 10 || seen.has(word)) return;
      if (STOP_WORDS.has(token.toLowerCase())) return;
      // A word in capitals throughout ("BJP", "NITI") is an acronym, not a word to spell.
      if (token === token.toUpperCase()) return;
      const capital = token[0] === token[0].toUpperCase();
      if (capital && index > 0) {
        names.push({ word, headline });
        seen.add(word);
      } else if (word.length >= 6) {
        others.push({ word, headline });
        seen.add(word);
      }
    });
  }
  const ranked = [...names, ...others];
  const firsts: HeadlineWord[] = [];
  const seconds: HeadlineWord[] = [];
  const used = new Set<string>();
  for (const entry of ranked) {
    if (used.has(entry.headline)) seconds.push(entry);
    else {
      firsts.push(entry);
      used.add(entry.headline);
    }
  }
  return [...firsts, ...seconds];
}

/* --------------------------------------------------------------------------
   Crossword.
   -------------------------------------------------------------------------- */

export type CrosswordClue = {
  number: number;
  clue: string;
  answer: string;
  row: number;
  col: number;
  length: number;
};

export type Crossword = {
  width: number;
  height: number;
  /** One string per row; "#" is a black square. */
  rows: string[];
  /** The clue number shown in a cell, keyed "row,col". */
  numbers: Record<string, number>;
  across: CrosswordClue[];
  down: CrosswordClue[];
};

const BOARD = 17;
const MAX_ANSWERS = 14;

type Placed = { word: string; headline: string; row: number; col: number; across: boolean };

/** The headline with the answer blanked, and the answer's length. */
function clueFor(headline: string, word: string): string {
  const blank = "_".repeat(word.length);
  const pattern = new RegExp(`\\b${word}\\b`, "i");
  return `${headline.replace(pattern, blank)} (${word.length})`;
}

export function makeCrossword(words: HeadlineWord[], random: Random): Crossword | null {
  // Longer answers first make a better-connected grid; the seed decides ties.
  const oneEach = words.filter(
    (entry, index) => words.findIndex((other) => other.headline === entry.headline) === index,
  );
  const pool = shuffle(oneEach, random)
    .slice(0, 60)
    .sort((a, b) => b.word.length - a.word.length);
  if (pool.length < 4) return null;

  const grid: string[][] = Array.from({ length: BOARD }, () => Array(BOARD).fill(""));
  const runs: string[][] = Array.from({ length: BOARD }, () => Array(BOARD).fill(""));
  const placed: Placed[] = [];

  const cell = (r: number, c: number) =>
    r < 0 || c < 0 || r >= BOARD || c >= BOARD ? "" : grid[r][c];

  /** Crossings if the word fits here, or -1 if it does not. */
  const fit = (word: string, row: number, col: number, across: boolean): number => {
    const dr = across ? 0 : 1;
    const dc = across ? 1 : 0;
    const endR = row + dr * (word.length - 1);
    const endC = col + dc * (word.length - 1);
    if (row < 0 || col < 0 || endR >= BOARD || endC >= BOARD) return -1;
    if (cell(row - dr, col - dc) || cell(endR + dr, endC + dc)) return -1;
    let crossings = 0;
    for (let i = 0; i < word.length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      const here = grid[r][c];
      if (here) {
        if (here !== word[i] || runs[r][c].includes(across ? "a" : "d")) return -1;
        crossings += 1;
      } else if (cell(r + dc, c + dr) || cell(r - dc, c - dr)) {
        // An empty square must not touch a letter beside it, or the grid
        // would spell words nobody clued.
        return -1;
      }
    }
    return crossings;
  };

  const put = (entry: HeadlineWord, row: number, col: number, across: boolean) => {
    for (let i = 0; i < entry.word.length; i += 1) {
      const r = row + (across ? 0 : i);
      const c = col + (across ? i : 0);
      grid[r][c] = entry.word[i];
      runs[r][c] += across ? "a" : "d";
    }
    placed.push({ ...entry, row, col, across });
  };

  const first = pool[0];
  put(first, Math.floor(BOARD / 2), Math.floor((BOARD - first.word.length) / 2), true);

  for (const entry of pool.slice(1)) {
    if (placed.length >= MAX_ANSWERS) break;
    let best: { row: number; col: number; across: boolean; score: number } | null = null;
    for (const other of placed) {
      for (let j = 0; j < other.word.length; j += 1) {
        const r = other.row + (other.across ? 0 : j);
        const c = other.col + (other.across ? j : 0);
        for (let i = 0; i < entry.word.length; i += 1) {
          if (entry.word[i] !== other.word[j]) continue;
          const across = !other.across;
          const row = across ? r : r - i;
          const col = across ? c - i : c;
          const score = fit(entry.word, row, col, across);
          if (score > 0 && (!best || score > best.score)) best = { row, col, across, score };
        }
      }
    }
    if (best) put(entry, best.row, best.col, best.across);
  }
  if (placed.length < 5) return null;

  // Crop to the letters, with no empty border.
  const used = placed.flatMap((p) =>
    [...p.word].map((_, i) => [p.row + (p.across ? 0 : i), p.col + (p.across ? i : 0)]),
  );
  const top = Math.min(...used.map(([r]) => r));
  const left = Math.min(...used.map(([, c]) => c));
  const bottom = Math.max(...used.map(([r]) => r));
  const right = Math.max(...used.map(([, c]) => c));
  const rows: string[] = [];
  for (let r = top; r <= bottom; r += 1) {
    let line = "";
    for (let c = left; c <= right; c += 1) line += grid[r][c] || "#";
    rows.push(line);
  }

  // Number the squares that start an answer, reading order, as printed grids do.
  const starts = new Map<string, Placed[]>();
  for (const p of placed) {
    const key = `${p.row - top},${p.col - left}`;
    starts.set(key, [...(starts.get(key) ?? []), p]);
  }
  const numbers: Record<string, number> = {};
  const across: CrosswordClue[] = [];
  const down: CrosswordClue[] = [];
  let next = 1;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[0].length; c += 1) {
      const here = starts.get(`${r},${c}`);
      if (!here) continue;
      numbers[`${r},${c}`] = next;
      for (const p of here) {
        const clue = {
          number: next,
          clue: clueFor(p.headline, p.word),
          answer: p.word,
          row: r,
          col: c,
          length: p.word.length,
        };
        (p.across ? across : down).push(clue);
      }
      next += 1;
    }
  }

  return { width: rows[0].length, height: rows.length, rows, numbers, across, down };
}

/* --------------------------------------------------------------------------
   Sudoku.
   -------------------------------------------------------------------------- */

export type Sudoku = {
  /** 81 digits, row by row; 0 is a square to fill. */
  puzzle: number[];
  solution: number[];
};

function candidates(board: number[], index: number): number[] {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const box = Math.floor(row / 3) * 27 + Math.floor(col / 3) * 3;
  const taken = new Set<number>();
  for (let i = 0; i < 9; i += 1) {
    taken.add(board[row * 9 + i]);
    taken.add(board[i * 9 + col]);
    taken.add(board[box + Math.floor(i / 3) * 9 + (i % 3)]);
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !taken.has(n));
}

function fill(board: number[], random: Random): boolean {
  const index = board.indexOf(0);
  if (index === -1) return true;
  for (const n of shuffle(candidates(board, index), random)) {
    board[index] = n;
    if (fill(board, random)) return true;
  }
  board[index] = 0;
  return false;
}

/** How many solutions, stopping at `limit`. */
function solutions(board: number[], limit: number): number {
  let best = -1;
  let bestOptions: number[] = [];
  for (let i = 0; i < 81; i += 1) {
    if (board[i]) continue;
    const options = candidates(board, i);
    if (!options.length) return 0;
    if (best === -1 || options.length < bestOptions.length) {
      best = i;
      bestOptions = options;
    }
  }
  if (best === -1) return 1;
  let count = 0;
  for (const n of bestOptions) {
    board[best] = n;
    count += solutions(board, limit - count);
    if (count >= limit) break;
  }
  board[best] = 0;
  return count;
}

/** A sudoku with exactly one solution and about thirty givens. */
export function makeSudoku(random: Random): Sudoku {
  const solution = Array(81).fill(0);
  fill(solution, random);
  const puzzle = [...solution];
  let givens = 81;
  for (const index of shuffle([...Array(81).keys()], random)) {
    if (givens <= 30) break;
    const kept = puzzle[index];
    puzzle[index] = 0;
    if (solutions([...puzzle], 2) === 1) givens -= 1;
    else puzzle[index] = kept;
  }
  return { puzzle, solution };
}

/* --------------------------------------------------------------------------
   Word search.
   -------------------------------------------------------------------------- */

export type WordSearch = {
  size: number;
  /** One string per row. */
  rows: string[];
  words: { word: string; cells: [number, number][] }[];
};

const SEARCH_SIZE = 12;
const SEARCH_WORDS = 10;
const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [1, -1],
];

export function makeWordSearch(words: HeadlineWord[], random: Random): WordSearch | null {
  const pool = shuffle(
    words.filter((w) => w.word.length >= 4 && w.word.length <= 9),
    random,
  );
  const grid: string[][] = Array.from({ length: SEARCH_SIZE }, () => Array(SEARCH_SIZE).fill(""));
  const placed: WordSearch["words"] = [];

  for (const { word } of pool) {
    if (placed.length >= SEARCH_WORDS) break;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const [dr, dc] = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
      const row = Math.floor(random() * SEARCH_SIZE);
      const col = Math.floor(random() * SEARCH_SIZE);
      const cells: [number, number][] = [...word].map((_, i) => [row + dr * i, col + dc * i]);
      const fits = cells.every(
        ([r, c], i) =>
          r >= 0 && c >= 0 && r < SEARCH_SIZE && c < SEARCH_SIZE && (!grid[r][c] || grid[r][c] === word[i]),
      );
      if (!fits) continue;
      cells.forEach(([r, c], i) => (grid[r][c] = word[i]));
      placed.push({ word, cells });
      break;
    }
  }
  if (placed.length < 5) return null;

  const letters = "ABCDEFGHIKLMNOPRSTUVWY";
  const rows = grid.map((row) =>
    row.map((letter) => letter || letters[Math.floor(random() * letters.length)]).join(""),
  );
  return { size: SEARCH_SIZE, rows, words: placed.sort((a, b) => a.word.localeCompare(b.word)) };
}

/* --------------------------------------------------------------------------
   An edition's puzzles.
   -------------------------------------------------------------------------- */

export type EditionPuzzles = {
  crossword: Crossword | null;
  sudoku: Sudoku;
  wordSearch: WordSearch | null;
};

export function makePuzzles(date: string, headlines: string[]): EditionPuzzles {
  const words = headlineWords(headlines);
  return {
    crossword: makeCrossword(words, seeded(`crossword:${date}`)),
    sudoku: makeSudoku(seeded(`sudoku:${date}`)),
    wordSearch: makeWordSearch(words, seeded(`wordsearch:${date}`)),
  };
}
