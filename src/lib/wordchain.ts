// 끝말잇기 (사용자 요청) — 낱말 목록(public/kkeut-words.txt, 명사 약 3만 개)을 게임을 켤 때 한 번만 받아 온다.
// 낱말 자료: hunspell-dict-ko (국립국어원 자료 포함, CC BY-SA 4.0) 에서 한글 명사만 추렸다.

export interface WordBook { all: Set<string>; byFirst: Map<string, string[]> }

let cache: Promise<WordBook> | null = null;
export function loadWords(): Promise<WordBook> {
  cache ??= fetch('/kkeut-words.txt').then(r => {
    if (!r.ok) throw new Error('words');
    return r.text();
  }).then(t => {
    const list = t.split('\n').filter(Boolean);
    const byFirst = new Map<string, string[]>();
    for (const w of list) {
      const a = byFirst.get(w[0]);
      if (a) a.push(w); else byFirst.set(w[0], [w]);
    }
    return { all: new Set(list), byFirst };
  }).catch(e => { cache = null; throw e; });
  return cache;
}

/** 두음법칙 — 끝 글자가 ㄹ·ㄴ으로 시작하면 바꾼 글자로도 이을 수 있다 (력→역, 로→노, 녀→여) */
export function startsFor(ch: string): string[] {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [ch];
  const cho = Math.floor(code / 588), jung = Math.floor((code % 588) / 28), jong = code % 28;
  const make = (c: number) => String.fromCharCode(0xac00 + c * 588 + jung * 28 + jong);
  if (cho === 5) {                                   // ㄹ
    if ([2, 6, 7, 12, 17, 20].includes(jung)) return [ch, make(11)];   // ㅑㅕㅖㅛㅠㅣ → ㅇ
    if ([0, 1, 8, 11, 13, 18].includes(jung)) return [ch, make(2)];    // ㅏㅐㅗㅚㅜㅡ → ㄴ
  }
  if (cho === 2 && [2, 6, 12, 17, 20].includes(jung)) return [ch, make(11)];   // 냐녀뇨뉴니 → ㅇ
  return [ch];
}

const last = (w: string) => w[w.length - 1];

/** w 다음에 이을 수 있는 (아직 안 쓴) 낱말들 */
export function followers(book: WordBook, w: string, used: Set<string>): string[] {
  return startsFor(last(w)).flatMap(c => book.byFirst.get(c) ?? []).filter(x => !used.has(x));
}

/** 사전에 이을 말이 아예 없는 낱말 (한방 단어) */
export function isDeadEnd(book: WordBook, w: string): boolean {
  return !startsFor(last(w)).some(c => book.byFirst.has(c));
}

const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** 컴퓨터 차례 — 상대가 이어 갈 말이 넉넉한 낱말을 먼저 고른다. prev가 없으면 첫 낱말 */
export function pickWord(book: WordBook, prev: string | null, used: Set<string>): string | null {
  let pool: string[];
  if (prev) pool = followers(book, prev, used);
  else {
    const firsts = [...book.byFirst.keys()];
    pool = [];
    for (let k = 0; k < 40; k++) pool.push(pickOne(book.byFirst.get(pickOne(firsts))!));
  }
  pool = pool.filter(w => w.length <= 4);
  if (!pool.length) return null;
  // 무작위로 몇 개 뽑아 보고, 이을 말이 5개 넘게 남는 것부터
  for (let k = 0; k < 30; k++) {
    const w = pickOne(pool);
    if (followers(book, w, used).length > 5) return w;
  }
  return pool.find(w => followers(book, w, used).length > 0) ?? pickOne(pool);
}

export type Check = 'ok' | 'short' | 'start' | 'used' | 'unknown' | 'dead';
export function checkWord(book: WordBook, prev: string, w: string, used: Set<string>): Check {
  if (!/^[가-힣]{2,}$/.test(w)) return 'short';
  if (!startsFor(last(prev)).includes(w[0])) return 'start';
  if (used.has(w)) return 'used';
  if (!book.all.has(w)) return 'unknown';
  if (isDeadEnd(book, w)) return 'dead';
  return 'ok';
}
