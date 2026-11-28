// 생성 이미지 속 프롬프트 읽기 (사용자 요청 — 마이페이지 「프롬프트 읽기」)
// NovelAI 그림은 두 곳에 생성 정보를 넣는다:
//   ① PNG 글 덩어리(tEXt·iTXt) — Comment(JSON) · Source · Software …
//   ② 픽셀 속 숨은 정보(stealth) — 투명도 맨 끝 비트를 세로줄 순서로 읽으면 "stealth_pngcomp"(gzip) / "stealth_pnginfo"
//      (①이 지워져도 ②가 남는 경우가 많다). RGB 버전(stealth_rgb*)도 있다.
// Stable Diffusion WebUI(A1111) PNG의 "parameters" 글도 기본은 읽는다.
// 그림은 브라우저 안에서만 읽는다.

export interface NaiChar { pos: string; neg: string; where: string }
export interface PromptInfo {
  source: string;            // 예: NovelAI · V4.5
  base: string;
  negative: string;
  chars: NaiChar[];
  chips: string[];           // 크기 · steps · CFG · 샘플러 · seed
  removed: string[];         // 지운 겹치는 태그
}

const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const utf8 = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);

async function inflate(data: Uint8Array, fmt: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const ds = new DecompressionStream(fmt);
  const out = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** PNG 글 덩어리들 (key → 글) */
async function pngTexts(b: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) return out;
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = latin1(b.subarray(i + 4, i + 8));
    const data = b.subarray(i + 8, i + 8 + len);
    try {
      if (type === 'tEXt') {
        const z = data.indexOf(0);
        if (z > 0) out[latin1(data.subarray(0, z))] = utf8(data.subarray(z + 1));
      } else if (type === 'iTXt') {
        const z = data.indexOf(0);
        const key = latin1(data.subarray(0, z));
        const compressed = data[z + 1] === 1;
        let p = z + 3;
        p = data.indexOf(0, p) + 1;      // 언어
        p = data.indexOf(0, p) + 1;      // 번역 키
        const body = data.subarray(p);
        out[key] = utf8(compressed ? await inflate(body, 'deflate') : body);
      } else if (type === 'zTXt') {
        const z = data.indexOf(0);
        out[latin1(data.subarray(0, z))] = utf8(await inflate(data.subarray(z + 2), 'deflate'));
      }
    } catch { /* 깨진 덩어리는 건너뛴다 */ }
    if (type === 'IEND') break;
    i += 12 + len;
  }
  return out;
}

/** 픽셀 속 숨은 정보(NovelAI stealth) */
async function stealthTexts(file: Blob): Promise<Record<string, string> | null> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { return null; }
  const w = bmp.width, h = bmp.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close(); return null; }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, w, h).data;
  const tryRead = async (chans: number[]) => {
    // 세로줄 순서(위→아래, 왼→오)로 비트를 꺼내는 읽개
    let x = 0, y = 0, ci = 0;
    const bit = () => {
      if (x >= w) return -1;
      const v = d[(y * w + x) * 4 + chans[ci]] & 1;
      ci++;
      if (ci >= chans.length) { ci = 0; y++; if (y >= h) { y = 0; x++; } }
      return v;
    };
    const bytes = (n: number) => {
      const o = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        let v = 0;
        for (let j = 0; j < 8; j++) { const t = bit(); if (t < 0) return null; v = (v << 1) | t; }
        o[k] = v;
      }
      return o;
    };
    const magicLen = chans.length === 1 ? 'stealth_pngcomp'.length : 'stealth_rgbcomp'.length;
    const m = bytes(magicLen);
    if (!m) return null;
    const magic = latin1(m);
    if (!/^stealth_(png|rgb)(comp|info)$/.test(magic)) return null;
    const lb = bytes(4);
    if (!lb) return null;
    const nBits = u32be(lb, 0);
    if (!nBits || nBits > w * h * chans.length) return null;
    const body = bytes(Math.floor(nBits / 8));
    if (!body) return null;
    const text = magic.endsWith('comp') ? utf8(await inflate(body, 'gzip')) : utf8(body);
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  };
  try {
    const j = (await tryRead([3])) ?? (await tryRead([0, 1, 2]));
    if (!j) return null;
    const out: Record<string, string> = {};
    Object.entries(j).forEach(([k, v]) => { out[k] = typeof v === 'string' ? v : JSON.stringify(v); });
    return out;
  } catch { return null; }
}

/* ---------- 태그 정리 ---------- */

/** 쉼표로 나눈 태그에서 같은 것은 하나만 — 지운 것도 돌려준다 */
export function dedupTags(text: string): { text: string; removed: string[] } {
  const seen = new Set<string>();
  const keep: string[] = [];
  const removed: string[] = [];
  text.split(/,|\n/).map(t => t.trim()).filter(Boolean).forEach(t => {
    const k = t.toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ');
    if (seen.has(k)) removed.push(t);
    else { seen.add(k); keep.push(t); }
  });
  return { text: keep.join(', '), removed };
}

const SAMPLER: Record<string, string> = {
  k_euler: 'Euler', k_euler_ancestral: 'Euler a', k_dpmpp_2s_ancestral: 'DPM++ 2S a', k_dpmpp_2m: 'DPM++ 2M',
  k_dpmpp_sde: 'DPM++ SDE', k_dpmpp_2m_sde: 'DPM++ 2M SDE', ddim: 'DDIM', ddim_v3: 'DDIM',
};

function whereOf(centers: unknown): string {
  const c = Array.isArray(centers) ? centers[0] as { x?: number; y?: number } : null;
  if (!c || typeof c.x !== 'number') return '';
  const x = c.x < 0.4 ? '왼쪽' : c.x > 0.6 ? '오른쪽' : '가운데';
  const y = typeof c.y === 'number' ? (c.y < 0.4 ? ' 위' : c.y > 0.6 ? ' 아래' : '') : '';
  return x === '가운데' && !y ? '가운데' : x + y;
}

interface NaiComment {
  prompt?: string; uc?: string; steps?: number; scale?: number; sampler?: string; seed?: number;
  width?: number; height?: number;
  v4_prompt?: { caption?: { base_caption?: string; char_captions?: { char_caption?: string; centers?: unknown }[] } };
  v4_negative_prompt?: { caption?: { base_caption?: string; char_captions?: { char_caption?: string; centers?: unknown }[] } };
}

function fromNai(t: Record<string, string>): PromptInfo | null {
  let c: NaiComment;
  try { c = JSON.parse(t.Comment) as NaiComment; } catch { return null; }
  const removed: string[] = [];
  const clean = (s?: string) => { const r = dedupTags(s ?? ''); removed.push(...r.removed); return r.text; };
  const pc = c.v4_prompt?.caption, nc = c.v4_negative_prompt?.caption;
  const base = clean(pc?.base_caption ?? c.prompt ?? t.Description);
  const negative = clean(nc?.base_caption ?? c.uc);
  const n = Math.max(pc?.char_captions?.length ?? 0, nc?.char_captions?.length ?? 0);
  const chars: NaiChar[] = [];
  for (let k = 0; k < n; k++) {
    const p = pc?.char_captions?.[k], q = nc?.char_captions?.[k];
    const pos = clean(p?.char_caption), neg = clean(q?.char_caption);
    if (pos || neg) chars.push({ pos, neg, where: whereOf(p?.centers ?? q?.centers) });
  }
  const src = t.Source ?? t.Software ?? 'NovelAI';
  const ver = /V(\d(?:\.\d)?)/i.exec(src)?.[1];
  const chips = [
    c.width && c.height ? `${c.width}×${c.height}` : '',
    c.steps ? `${c.steps} steps` : '',
    c.scale != null ? `CFG ${c.scale}` : '',
    c.sampler ? (SAMPLER[c.sampler] ?? c.sampler) : '',
    c.seed != null ? `seed ${c.seed}` : '',
  ].filter(Boolean);
  return { source: ver ? `NovelAI · V${ver}` : 'NovelAI', base, negative, chars, chips, removed };
}

/** A1111 WebUI "parameters" — 프롬프트 / Negative prompt: … / Steps: … */
function fromA1111(p: string): PromptInfo {
  const ni = p.indexOf('\nNegative prompt:');
  const si = p.search(/\nSteps: /);
  const pos = p.slice(0, ni >= 0 ? ni : si >= 0 ? si : p.length);
  const neg = ni >= 0 ? p.slice(ni + 17, si > ni ? si : p.length) : '';
  const tail = si >= 0 ? p.slice(si + 1) : '';
  const get = (k: string) => new RegExp(`${k}: ([^,]+)`).exec(tail)?.[1]?.trim();
  const a = dedupTags(pos), b = dedupTags(neg);
  return {
    source: 'Stable Diffusion', base: a.text, negative: b.text, chars: [],
    chips: [get('Size'), get('Steps') && `${get('Steps')} steps`, get('CFG scale') && `CFG ${get('CFG scale')}`, get('Sampler'), get('Seed') && `seed ${get('Seed')}`].filter(Boolean) as string[],
    removed: [...a.removed, ...b.removed],
  };
}

/** 그림에서 프롬프트 읽기 — 못 찾으면 null */
export async function readPromptInfo(file: Blob): Promise<PromptInfo | null> {
  const b = new Uint8Array(await file.arrayBuffer());
  const t = await pngTexts(b);
  if (t.Comment) { const r = fromNai(t); if (r) return r; }
  if (t.parameters) return fromA1111(t.parameters);
  const s = await stealthTexts(file);
  if (s?.Comment) { const r = fromNai(s); if (r) return r; }
  if (s?.parameters) return fromA1111(s.parameters);
  return null;
}

/** 전부 복사용 글 */
export function promptInfoText(p: PromptInfo): string {
  const out = [`[베이스]\n${p.base}`, `[네거티브]\n${p.negative}`];
  p.chars.forEach((c, i) => {
    out.push(`[캐릭터 ${i + 1}${c.where ? ` · ${c.where}` : ''}]\n긍정: ${c.pos}${c.neg ? `\n부정: ${c.neg}` : ''}`);
  });
  return out.join('\n\n');
}
