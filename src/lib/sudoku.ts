// 스도쿠 문제 만들기 (사용자 요청 — 매번 다른 문제).
// 1) 빈 판을 무작위 순서로 채워 정답 판을 만들고 2) 칸을 무작위로 지워 가며, 답이 하나뿐일 때만 지운 채로 둔다.
// 남기는 칸 수로 난이도를 나눈다. 0 = 빈칸.

const box = (i: number) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 답의 개수를 limit까지만 센다 (후보가 가장 적은 칸부터) — fill이면 첫 답으로 g를 채운다 */
function solve(g: number[], limit: number, fill = false): number {
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    rows[Math.floor(i / 9)] |= b; cols[i % 9] |= b; boxes[box(i)] |= b;
  }
  let count = 0;
  const go = (): boolean => {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const used = rows[Math.floor(i / 9)] | cols[i % 9] | boxes[box(i)];
      const mask = ~used & 0x3fe;
      let n = 0;
      for (let m = mask; m; m &= m - 1) n++;
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (!n) return false; }
    }
    if (best < 0) { count++; return count >= limit; }
    const r = Math.floor(best / 9), c = best % 9, bx = box(best);
    const digits: number[] = [];
    for (let v = 1; v <= 9; v++) if (bestMask & (1 << v)) digits.push(v);
    if (fill) shuffle(digits);
    for (const v of digits) {
      const b = 1 << v;
      g[best] = v; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      if (go()) { if (!fill) g[best] = 0; return true; }
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
    }
    return false;
  };
  go();
  return count;
}

export interface Sudoku { puzzle: number[]; solution: number[] }

/** clues = 남길 칸 수 (작을수록 어렵다) */
export function makeSudoku(clues: number): Sudoku {
  const solution = new Array(81).fill(0);
  solve(solution, 1, true);
  const puzzle = [...solution];
  let left = 81;
  for (const i of shuffle([...Array(81).keys()])) {
    if (left <= clues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (solve([...puzzle], 2) !== 1) puzzle[i] = keep;
    else left--;
  }
  return { puzzle, solution };
}

export const sudokuBox = box;
