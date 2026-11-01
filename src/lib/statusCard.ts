// 상태창 (사용자 요청) — 글에 <JISUNWOO scene='{…}' npc='{…}' … /> 를 붙여 넣으면 그 자리에 상태창 카드를 그린다.
// 본문은 글 그대로 저장하고, 보여 줄 때만 자리표시 <div class="jsw-mount">로 바꿔 StatusCardMounter가 카드를 띄운다.

export const STATUS_GROUPS = ['scene', 'npc', 'pc', 'life', 'heart', 'plans', 'records'] as const;

/** 로그 정리를 누르면 맨 밑에 미리 넣어 두는 빈 상태창 */
export const STATUS_TEMPLATE = `<JISUNWOO ${STATUS_GROUPS.map(g => `${g}='{}'`).join(' ')} />`;

interface Found { start: number; end: number; attrs: Record<string, string> }

/** 글 속 상태창 태그 찾기 — 값 안에 '나 >가 있어도 다음 속성·닫는 괄호 앞의 따옴표에서만 끊는다 */
export function findStatusTags(text: string): Found[] {
  const out: Found[] = [];
  const open = /<JISUNWOO\b/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    let i = m.index + m[0].length;
    const attrs: Record<string, string> = {};
    let ok = false;
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('/>', i)) { i += 2; ok = true; break; }
      if (text[i] === '>') {
        i += 1;
        // <JISUNWOO …></JISUNWOO> 꼴도 받는다
        const close = /^\s*<\/JISUNWOO\s*>/i.exec(text.slice(i));
        if (close) i += close[0].length;
        ok = true; break;
      }
      const nm = /^([\w-]+)\s*=\s*/.exec(text.slice(i));
      if (!nm) break;
      i += nm[0].length;
      const q = text[i];
      if (q === '\'' || q === '"') {
        // 닫는 따옴표 = 뒤에 「다음 속성=」이나 「/>」「>」가 오는 따옴표
        const rest = text.slice(i + 1);
        const re = new RegExp(`${q}(?=\\s+[\\w-]+\\s*=|\\s*\\/?>)`, 'g');
        const end = re.exec(rest);
        if (!end) break;
        attrs[nm[1]] = rest.slice(0, end.index);
        i += 1 + end.index + 1;
      } else if (q === '{') {
        // scene={'{…}'} 같은 JSX 식 — 짝 맞는 } 까지
        let depth = 0, j = i;
        for (; j < text.length; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}' && --depth === 0) break;
        }
        if (j >= text.length) break;
        attrs[nm[1]] = text.slice(i + 1, j).trim().replace(/^(['"`])([\s\S]*)\1$/, '$2');
        i = j + 1;
      } else break;
    }
    if (ok) { out.push({ start: m.index, end: i, attrs }); open.lastIndex = i; }
  }
  return out;
}

const isEmptyTag = (t: Found) => STATUS_GROUPS.every(g => !(t.attrs[g] ?? '').trim() || (t.attrs[g] ?? '').trim() === '{}');

/** 상태창이 없으면 맨 밑에 빈 상태창을 붙인다 */
export function withStatusTemplate(text: string): string {
  if (findStatusTags(text).length) return text;
  return text.replace(/\s*$/, '') + (text.trim() ? '\n\n' : '') + STATUS_TEMPLATE;
}

/** 채워진 상태창을 붙여 넣으면 미리 넣어 둔 빈 상태창은 빼 준다 */
export function dropEmptyTemplates(text: string): string {
  const tags = findStatusTags(text);
  if (tags.length < 2 || !tags.some(t => !isEmptyTag(t))) return text;
  let out = text;
  for (const t of [...tags].reverse()) {
    if (!isEmptyTag(t)) continue;
    out = out.slice(0, t.start).replace(/\n*$/, '') + out.slice(t.end).replace(/^[ \t]*\n?/, '\n');
  }
  return out.replace(/^\n+/, '');
}

/** 렌더용 — 태그를 카드 자리표시로. keepEmpty가 아니면 빈 상태창은 지운다 (글쓰기 미리보기에서만 보인다) */
export function embedStatusCards(text: string, keepEmpty = false): string {
  const tags = findStatusTags(text);
  if (!tags.length) return text;
  let out = '', at = 0;
  for (const t of tags) {
    out += text.slice(at, t.start);
    if (keepEmpty || !isEmptyTag(t)) {
      out += `\n\n<div class="jsw-mount" data-jsw="${encodeURIComponent(JSON.stringify(t.attrs))}"></div>\n\n`;
    }
    at = t.end;
  }
  return out + text.slice(at);
}

/** 로그 정리 등 줄 단위 손질에서 상태창 태그를 건드리지 않게 — 태그와 나머지를 나눈다 */
export function splitStatusTags(text: string): { text: string; tag: boolean }[] {
  const tags = findStatusTags(text);
  const parts: { text: string; tag: boolean }[] = [];
  let at = 0;
  for (const t of tags) {
    if (t.start > at) parts.push({ text: text.slice(at, t.start), tag: false });
    parts.push({ text: text.slice(t.start, t.end), tag: true });
    at = t.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), tag: false });
  return parts;
}
