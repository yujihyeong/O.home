// 발췌기 마크다운 읽기 (사용자 요청) — 문단 글에 적힌 마크다운 표시를 꾸밈(굵게·기울임·형광펜)으로 바꾸고 기호는 지운다.
//   **굵게** __굵게__ · *기울임* _기울임_ · ***둘 다*** · ==형광펜== · `코드`(기호만 지움)
//   줄 앞의 # 제목(굵게) · > 인용 · - / * / + 목록(• 로) · \* 처럼 \ 를 앞에 두면 기호 그대로
export interface MdRun { t: string; b?: boolean; i?: boolean; h?: boolean }

// 밑줄(_)은 단어 안(snake_case 등)에서는 꾸밈으로 보지 않는다
const W = '[\\p{L}\\p{N}]';
const INLINE = new RegExp([
  '(?<bi>\\*\\*\\*(?=\\S)(?<bi1>[\\s\\S]+?)(?<=\\S)\\*\\*\\*)',
  `(?<bi2>(?<!${W})___(?=\\S)(?<bi3>[\\s\\S]+?)(?<=\\S)___(?!${W}))`,
  '(?<b>\\*\\*(?=\\S)(?<b1>[\\s\\S]+?)(?<=\\S)\\*\\*)',
  `(?<b2>(?<!${W})__(?=\\S)(?<b3>[\\s\\S]+?)(?<=\\S)__(?!${W}))`,
  '(?<h>==(?=\\S)(?<h1>[\\s\\S]+?)(?<=\\S)==)',
  '(?<i>\\*(?=\\S)(?<i1>[\\s\\S]+?)(?<=\\S)\\*)',
  `(?<i2>(?<!${W})_(?=\\S)(?<i3>[\\s\\S]+?)(?<=\\S)_(?!${W}))`,
  '(?<c>`(?<c1>[^`\\n]+)`)',
].join('|'), 'u');

function inline(text: string, m: Omit<MdRun, 't'>, out: MdRun[]) {
  let rest = text;
  for (;;) {
    const x = INLINE.exec(rest);
    if (!x) { if (rest) out.push({ t: rest, ...m }); return; }
    const g = x.groups ?? {};
    if (x.index) out.push({ t: rest.slice(0, x.index), ...m });
    if (g.bi1 !== undefined || g.bi3 !== undefined) inline(g.bi1 ?? g.bi3, { ...m, b: true, i: true }, out);
    else if (g.b1 !== undefined || g.b3 !== undefined) inline(g.b1 ?? g.b3, { ...m, b: true }, out);
    else if (g.h1 !== undefined) inline(g.h1, { ...m, h: true }, out);
    else if (g.i1 !== undefined || g.i3 !== undefined) inline(g.i1 ?? g.i3, { ...m, i: true }, out);
    else out.push({ t: g.c1 ?? '', ...m });
    rest = rest.slice(x.index + x[0].length);
  }
}

/** 마크다운 표시가 있는가 — 없으면 손대지 않는다 */
export const hasMd = (t: string) => /(\*\*|__|==)\S|(^|\s)[*_]\S[^\n]*\S[*_]|`[^`]+`|^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s)/m.test(t);

export function mdToRuns(text: string): MdRun[] {
  // \* 같은 이스케이프는 잠시 다른 글자로 숨겼다가 되돌린다
  const ESC = ['', '', '', '', '', ''];
  const SRC = ['*', '_', '=', '`', '#', '>'];
  let s = text.replace(/\\([*_=`#>])/g, (_, c: string) => ESC[SRC.indexOf(c)]);
  const out: MdRun[] = [];
  s.split('\n').forEach((line, k) => {
    if (k) out.push({ t: '\n' });
    let m: Omit<MdRun, 't'> = {};
    let l = line;
    const hd = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
    if (hd) { l = hd[1]; m = { b: true }; }
    l = l.replace(/^\s{0,3}>\s?/, '');
    l = l.replace(/^(\s*)[-*+]\s+/, '$1• ');
    inline(l, m, out);
  });
  s = '';
  const back = (t: string) => t.replace(/[-]/g, c => SRC[ESC.indexOf(c)]);
  // 같은 꾸밈끼리 붙인다
  const merged: MdRun[] = [];
  for (const r of out) {
    const t = back(r.t);
    if (!t) continue;
    const last = merged[merged.length - 1];
    if (last && !!last.b === !!r.b && !!last.i === !!r.i && !!last.h === !!r.h) last.t += t;
    else merged.push({ ...r, t });
  }
  return merged.length ? merged : [{ t: '' }];
}
