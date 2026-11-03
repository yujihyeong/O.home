// 상태창 (사용자 요청) — 글에 <JISUNWOO scene='{…}' npc='{…}' … /> 를 붙여 넣으면 그 자리에 상태창 카드를 그린다.
// 본문은 글 그대로 저장하고, 보여 줄 때만 자리표시 <div class="jsw-mount">로 바꿔 StatusCardMounter가 카드를 띄운다.

export const STATUS_GROUPS = ['scene', 'npc', 'pc', 'life', 'heart', 'plans', 'records'] as const;

/** 로그 정리를 누르면 맨 밑에 미리 넣어 두는 빈 상태창 */
export const STATUS_TEMPLATE = `<JISUNWOO ${STATUS_GROUPS.map(g => `${g}='{}'`).join(' ')} />`;

interface Found {
  start: number; end: number; attrs: Record<string, string>;
  /** 빈 상태창 속에 들어간 태그였으면 안쪽 태그 글 — 고쳐 쓸 때 이것만 남긴다 */
  inner?: string;
}

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
    if (ok) {
      /* 미리 넣어 둔 빈 상태창 「안」에 붙여 넣은 경우 (사용자 제보 — scene 칸만 형식 오류) —
         커서가 scene=' 뒤에 있으면 새 태그가 빈 태그 속으로 들어간다. 안쪽 태그를 쓰고,
         바깥 빈 태그의 남은 조각({}' npc='{}' … />)까지 한 덩어리로 묶는다 */
      const inner = text.slice(m.index + 1, i).search(/<JISUNWOO\b/i);
      if (inner >= 0) {
        const found = findStatusTags(text.slice(m.index + 1 + inner));
        if (found.length) {
          const t = found[0];
          const innerEnd = m.index + 1 + inner + t.end;
          const junk = /^\s*\{?\}?['"]?(?:\s+[\w-]+\s*=\s*(['"])\{\}\1)*\s*\/?>/.exec(text.slice(innerEnd));
          const end = innerEnd + (junk ? junk[0].length : 0);
          out.push({ start: m.index, end, attrs: t.attrs, inner: text.slice(m.index + 1 + inner + t.start, innerEnd) });
          open.lastIndex = end;
          continue;
        }
      }
      out.push({ start: m.index, end: i, attrs });
      open.lastIndex = i;
    }
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
  // 빈 상태창 속으로 붙여 넣어졌으면 안쪽 태그만 남긴다
  const nested = findStatusTags(text).filter(t => t.inner);
  for (const t of [...nested].reverse()) text = text.slice(0, t.start) + t.inner + text.slice(t.end);
  const tags = findStatusTags(text);
  if (tags.length < 2 || !tags.some(t => !isEmptyTag(t))) return text;
  let out = text;
  for (const t of [...tags].reverse()) {
    if (!isEmptyTag(t)) continue;
    out = out.slice(0, t.start).replace(/\n*$/, '') + out.slice(t.end).replace(/^[ \t]*\n?/, '\n');
  }
  return out.replace(/^\n+/, '');
}

/* ---------- 도브(본서사) 트래커 (사용자 요청) ----------
   로판 AI의 트래커는 「항목 이름 / 내용」이 줄줄이 나오는 목록이라, 복사한 글을 <DOVE> … </DOVE> 사이에
   그대로 넣어 두고 보여 줄 때 항목별로 나눠 DOVSI ARCHIVE 카드로 그린다. 글 자체는 복사한 그대로 남는다 */
export const DOVE_OPEN = '<DOVE>';
export const DOVE_CLOSE = '</DOVE>';
const DOVE_RE = /<DOVE>([\s\S]*?)<\/DOVE>/gi;

interface Block { start: number; end: number; data: Record<string, string>; empty: boolean }

function findDoveBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const m of text.matchAll(DOVE_RE)) {
    out.push({ start: m.index!, end: m.index! + m[0].length, data: { kind: 'dove', text: m[1] }, empty: !m[1].trim() });
  }
  return out;
}

/** 글 속 상태창 전부 — 티팟(JISUNWOO)과 도브(DOVE)를 앞에서부터 차례로 */
function findBlocks(text: string): Block[] {
  const dove = findDoveBlocks(text);
  // 도브 트래커 안의 글은 티팟 태그로 보지 않는다
  const inDove = (i: number) => dove.some(d => i >= d.start && i < d.end);
  const tea = findStatusTags(text).filter(t => !inDove(t.start))
    .map(t => ({ start: t.start, end: t.end, data: t.attrs, empty: isEmptyTag(t) }));
  return [...tea, ...dove].sort((a, b) => a.start - b.start);
}

/** 트래커를 붙여 넣는다 — 이미 있으면 그 자리를 바꾸고, 없으면 글 맨 밑에 */
export function withDoveTracker(text: string, tracker: string): string {
  const block = `${DOVE_OPEN}\n${tracker.trim()}\n${DOVE_CLOSE}`;
  const found = findDoveBlocks(text);
  if (found.length) {
    const last = found[found.length - 1];
    return text.slice(0, last.start) + block + text.slice(last.end);
  }
  return text.replace(/\s*$/, '') + (text.trim() ? '\n\n' : '') + block;
}

/** 렌더용 — 태그를 카드 자리표시로. keepEmpty가 아니면 빈 상태창은 지운다 (글쓰기 미리보기에서만 보인다) */
export function embedStatusCards(text: string, keepEmpty = false): string {
  const tags = findBlocks(text);
  if (!tags.length) return text;
  let out = '', at = 0;
  for (const t of tags) {
    out += text.slice(at, t.start);
    if (keepEmpty || !t.empty) {
      out += `\n\n<div class="jsw-mount" data-jsw="${encodeURIComponent(JSON.stringify(t.data))}"></div>\n\n`;
    }
    at = t.end;
  }
  return out + text.slice(at);
}

/** 로그 정리 등 줄 단위 손질에서 상태창 태그를 건드리지 않게 — 태그와 나머지를 나눈다 */
export function splitStatusTags(text: string): { text: string; tag: boolean }[] {
  const tags = findBlocks(text);
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
