// 발췌 페이지 나누기 (사용자 요청) — 글을 N장으로, 맥락이 뜬금없이 끊기지 않게 나눈다.
// AI를 부르지 않고 글의 짜임을 읽어 끊을 자리를 고른다:
//  · 문장 중간에서는 절대 끊지 않는다. 문단 끝을 가장 먼저 고르고, 문단이 너무 길 때만 문장 끝에서 끊는다
//  · 주고받는 대사 사이, 「그러나·그리고…」처럼 앞말에 기대는 문단 앞, 쉼표·쌍점으로 이어지는 자리는 피한다
//  · 장면 구분선(***, ―――) 앞뒤는 반긴다
//  · 그 안에서 장마다 분량이 비슷하도록 고른다 (가능한 모든 끊는 자리를 견줘 가장 좋은 조합을 찾는다)

export interface Seg { p: number; from: number; to: number; whole: boolean }

const OPEN_Q = /^\s*["“「『'‘]/, CLOSE_Q = /["”」』'’]\s*$/;
const isQuote = (t: string) => OPEN_Q.test(t) && CLOSE_Q.test(t) && t.trim().length > 2;
const isBreak = (t: string) => /^[\s*＊※―—–\-_=~·•.…#]+$/.test(t) && t.trim().length > 0;
// 앞 내용에 기대어 시작하는 말 — 이런 문단 앞에서 끊으면 뜬금없다
const LEANS = /^\s*(그러나|그리고|그래서|그런데|그러자|그러면|그러니|그렇지만|그렇게|그러다|그러고|그럼에도|그래도|하지만|하나|허나|또한|또|게다가|더구나|따라서|그도|그녀도|그것은|그것이|그건|그게|그제야|그때|그 순간|그 말에|그 모습|이윽고|그리하여|왜냐하면|그렇다면|물론|결국|마침내|대신|오히려|덕분에|때문에)/;

/** 문단을 문장 단위로 — 마침표·물음표·느낌표(와 닫는 따옴표) 뒤 빈칸에서만 나눈다 */
function sentences(t: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /[.!?…。！？]+["”’」』)\]]*\s+/g;
  let at = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    if (end - at >= 12) { out.push([at, end]); at = end; }   // 너무 짧은 조각은 다음 문장에 붙인다
  }
  if (at < t.length) {
    if (out.length && t.length - at < 12) out[out.length - 1][1] = t.length;
    else out.push([at, t.length]);
  }
  return out;
}

/** 나눌 수 있는 최대 장수 */
export function maxPages(paras: string[]): number {
  return paras.reduce((n, t) => n + (isQuote(t) || isBreak(t) ? 1 : Math.max(1, sentences(t).length)), 0);
}

export function splitPages(paras: string[], want: number): Seg[][] {
  // 1) 끊을 수 있는 가장 작은 덩이 — 문장 (대사·구분선 문단은 통째로)
  interface Unit { p: number; from: number; to: number; len: number; first: boolean; last: boolean }
  const units: Unit[] = [];
  paras.forEach((t, p) => {
    const ss: [number, number][] = isQuote(t) || isBreak(t) ? [[0, t.length]] : sentences(t);
    if (!ss.length) ss.push([0, t.length]);
    ss.forEach(([from, to], k) => units.push({
      p, from, to, first: k === 0, last: k === ss.length - 1,
      // 줄 수에 가깝게 — 문단이 바뀌면 줄이 하나 더 든다
      len: (to - from) + (k === 0 ? 14 : 0),
    }));
  });
  const m = units.length;
  const n = Math.max(1, Math.min(want, m));
  const total = units.reduce((s, u) => s + u.len, 0);
  const T = total / n;

  // 2) j번째 덩이 앞에서 끊을 때의 벌점 (T의 몇 배만큼 어색한가)
  const pen = new Array(m).fill(0);
  for (let j = 1; j < m; j++) {
    const a = units[j - 1], b = units[j];
    let k = 0;
    if (a.p === b.p) k = 1.0;                                    // 문단 한가운데
    else {
      const prev = paras[a.p], next = paras[b.p];
      if (isBreak(prev) || isBreak(next)) k = -0.5;              // 장면이 바뀌는 자리
      else {
        if (isQuote(prev) && isQuote(next)) k = Math.max(k, 0.75);       // 주고받는 대사
        else if (isQuote(prev) !== isQuote(next)) k = Math.max(k, 0.25); // 대사와 그 앞뒤 지문
        if (LEANS.test(next)) k = Math.max(k, 0.8);
        if (/[,:;，、—–\-]\s*$/.test(prev) || !/[.!?…。！？"”’」』)\]]\s*$/.test(prev)) k = Math.max(k, 0.95);
        if (next.trim().length < 18 && !isQuote(next)) k = Math.max(k, 0.4);   // 짧은 한 줄은 앞 문단의 맺음일 때가 많다
      }
    }
    pen[j] = Math.sign(k) * (k * T) ** 2;
  }

  // 3) 장마다 분량이 T에 가깝고 벌점이 가장 적은 조합 (동적 계획법)
  const pre = [0];
  units.forEach(u => pre.push(pre[pre.length - 1] + u.len));
  const INF = Infinity;
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let j = k; j <= m - (n - k); j++) {
      for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] === INF) continue;
        const c = best[k - 1][i] + (pre[j] - pre[i] - T) ** 2 + (i > 0 ? pen[i] : 0);
        if (c < best[k][j]) { best[k][j] = c; from[k][j] = i; }
      }
    }
  }
  const cuts: number[] = [m];
  for (let k = n, j = m; k > 0; k--) { j = from[k][j]; cuts.unshift(j); }

  // 4) 덩이를 장으로 — 같은 문단의 이어진 문장은 한 조각으로 합친다
  const pages: Seg[][] = [];
  for (let k = 0; k < n; k++) {
    const segs: Seg[] = [];
    for (let j = cuts[k]; j < cuts[k + 1]; j++) {
      const u = units[j], lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.p === u.p) lastSeg.to = u.to;
      else segs.push({ p: u.p, from: u.from, to: u.to, whole: false });
    }
    segs.forEach(s => { s.whole = s.from === 0 && s.to === paras[s.p].length; });
    // 장 맨 앞·맨 뒤의 구분선은 뺀다
    while (segs.length > 1 && isBreak(paras[segs[0].p])) segs.shift();
    while (segs.length > 1 && isBreak(paras[segs[segs.length - 1].p])) segs.pop();
    pages.push(segs);
  }
  return pages;
}
