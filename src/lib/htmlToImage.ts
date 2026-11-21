// HTML → PNG (사용자 요청 — 마이페이지 HTML 이미지 편집기).
// 화면을 찍는 게 아니라, 미리보기 문서를 통째로 복제해 SVG(foreignObject)에 넣고 캔버스에 다시 그린다.
// SVG 그림은 바깥 파일을 못 읽으므로 그림·CSS·글꼴 주소를 전부 data URL로 바꿔 넣는다.
// 큰 배율로 그릴수록 선명하다 — 다만 브라우저 캔버스 한계(특히 휴대폰)를 넘지 않게 자동으로 줄인다.

const cache = new Map<string, Promise<string | null>>();

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(b);
  });
}

/** 주소 → data URL (실패하면 null). 다른 사이트 그림은 그 서버가 허락(CORS)할 때만 담긴다 */
function toDataUrl(raw: string, base: string): Promise<string | null> {
  if (!raw || raw.startsWith('data:')) return Promise.resolve(raw || null);
  let abs = raw;
  try { abs = new URL(raw, base).href; } catch { /* 그대로 */ }
  if (!/^(https?|blob):/i.test(abs)) return Promise.resolve(null);
  let p = cache.get(abs);
  if (!p) {
    p = fetch(abs, { mode: 'cors', credentials: 'omit' })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => (b && b.size ? blobToDataUrl(b) : null))
      .catch(() => null);
    cache.set(abs, p);
  }
  return p;
}

/** CSS 글 안의 url(...)을 모두 data URL로 — base는 그 CSS가 있던 주소 */
async function inlineCssUrls(css: string, base: string): Promise<string> {
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const urls = [...new Set([...css.matchAll(re)].map(m => m[2].trim()).filter(u => u && !u.startsWith('data:') && !u.startsWith('#')))];
  const found = await Promise.all(urls.map(u => toDataUrl(u, base)));
  urls.forEach((u, i) => { const d = found[i]; if (d) css = css.split(u).join(d); });
  return css;
}

/** 문서에 걸린 CSS 전부 — <style>은 그대로, 바깥 <link>는 받아 와서 (글꼴 CSS 포함) */
async function collectCss(doc: Document, base: string): Promise<string> {
  const parts: string[] = [];
  // 미리보기(iframe)의 요소는 다른 창 소속이라 instanceof 대신 태그 이름으로 가린다
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('style, link[rel~="stylesheet"]'))) {
    if (el.hasAttribute('data-ohx-edit')) continue;
    if (el.tagName === 'STYLE') { parts.push(await inlineCssUrls(el.textContent ?? '', base)); continue; }
    const href = (el as HTMLLinkElement).href;
    if (!href) continue;
    try {
      const txt = await (await fetch(href, { mode: 'cors', credentials: 'omit' })).text();
      // @import 한 겹까지 따라간다 (구글 글꼴 등)
      let css = txt;
      for (const m of [...txt.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi)]) {
        try {
          const u = new URL(m[1], href).href;
          css = css.replace(m[0], await inlineCssUrls(await (await fetch(u, { mode: 'cors', credentials: 'omit' })).text(), u));
        } catch { /* 건너뜀 */ }
      }
      parts.push(await inlineCssUrls(css, href));
    } catch { /* 못 읽는 시트는 건너뜀 */ }
  }
  return parts.join('\n');
}

export interface Rendered { blob: Blob; width: number; height: number; scale: number; missed: number }

/** 고를 수 있는 가장 큰 배율 — 휴대폰은 캔버스 넓이 약 1,600만 화소, 컴퓨터는 넉넉히 */
export function maxScaleFor(w: number, h: number): number {
  const mobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);
  const AREA = mobile ? 16_000_000 : 60_000_000, DIM = mobile ? 8192 : 16384;
  return Math.max(0.25, Math.min(DIM / w, DIM / h, Math.sqrt(AREA / (w * h))));
}

/** 미리보기 문서(같은 출처 iframe)를 PNG로 */
export async function renderDocToPng(doc: Document, wantScale: number, onStep?: (t: string) => void): Promise<Rendered> {
  const html = doc.documentElement, body = doc.body;
  const width = Math.max(html.scrollWidth, body?.scrollWidth ?? 0, 1);
  const height = Math.max(html.scrollHeight, body?.scrollHeight ?? 0, 1);
  const scale = Math.min(wantScale, maxScaleFor(width, height));
  const base = doc.baseURI || location.href;
  let missed = 0;

  onStep?.('글꼴·스타일 모으는 중…');
  const css = await collectCss(doc, base);

  onStep?.('그림 담는 중…');
  const clone = html.cloneNode(true) as HTMLElement;
  // 그려진 캔버스는 복제하면 비므로 원본에서 그림을 떠 온다
  const liveCanvas = Array.from(html.querySelectorAll('canvas'));
  Array.from(clone.querySelectorAll('canvas')).forEach((c, i) => {
    const img = doc.createElement('img');
    try { img.setAttribute('src', liveCanvas[i].toDataURL()); } catch { /* 오염된 캔버스 */ }
    img.setAttribute('style', `width:${liveCanvas[i]?.clientWidth ?? 0}px;height:${liveCanvas[i]?.clientHeight ?? 0}px`);
    c.replaceWith(img);
  });
  // 입력칸의 지금 값도 그대로
  const liveInputs = Array.from(html.querySelectorAll('input, textarea, select')) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
  Array.from(clone.querySelectorAll('input, textarea, select')).forEach((el, i) => {
    const live = liveInputs[i];
    if (!live) return;
    if (el.tagName === 'TEXTAREA') el.textContent = live.value;
    else if (el.tagName === 'INPUT') {
      const t = (el.getAttribute('type') ?? '').toLowerCase();
      if (t === 'checkbox' || t === 'radio') { if ((live as HTMLInputElement).checked) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
      else el.setAttribute('value', live.value);
    }
  });
  // 그릴 수 없는 것·편집용 표시는 뺀다
  clone.querySelectorAll('script, link, iframe, object, embed, noscript, template, meta, base, [data-ohx-edit]').forEach(n => n.remove());
  clone.querySelectorAll('style').forEach(n => n.remove());
  clone.querySelectorAll('[data-ohx-text], [data-ohx-img], [contenteditable]').forEach(n => {
    n.removeAttribute('data-ohx-text'); n.removeAttribute('data-ohx-img'); n.removeAttribute('contenteditable'); n.removeAttribute('data-ohx-on');
  });
  // XML 이름으로 못 쓰는 속성(@click, :class 등)은 지운다 — 그대로 두면 SVG가 깨진다
  const okName = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
  clone.querySelectorAll('*').forEach(el => Array.from(el.attributes).forEach(a => { if (!okName.test(a.name)) el.removeAttribute(a.name); }));
  // 그림 · srcset · 인라인 style의 url()
  await Promise.all(Array.from(clone.querySelectorAll('img')).map(async im => {
    im.removeAttribute('srcset'); im.removeAttribute('loading');
    const src = im.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    const d = await toDataUrl(src, base);
    if (d) im.setAttribute('src', d); else { im.removeAttribute('src'); missed++; }
  }));
  await Promise.all(Array.from(clone.querySelectorAll<HTMLElement>('[style*="url("]')).map(async el => {
    el.setAttribute('style', await inlineCssUrls(el.getAttribute('style') ?? '', base));
  }));
  await Promise.all(Array.from(clone.querySelectorAll('image, use')).map(async el => {
    for (const a of ['href', 'xlink:href']) {
      const v = el.getAttribute(a);
      if (v && !v.startsWith('data:') && !v.startsWith('#')) { const d = await toDataUrl(v, base); if (d) el.setAttribute(a, d); }
    }
  }));

  // 모은 CSS를 맨 앞에 — 크기는 원본 문서 그대로
  const head = clone.querySelector('head') ?? clone;
  const st = doc.createElement('style');
  st.textContent = css;
  head.insertBefore(st, head.firstChild);
  clone.style.setProperty('width', `${width}px`);
  clone.style.setProperty('height', `${height}px`);
  clone.style.setProperty('overflow', 'hidden');

  onStep?.("그리는 중…");
  const xhtml = new XMLSerializer().serializeToString(clone).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
  // data: 주소로 읽어야 캔버스가 '오염'되지 않아 PNG로 꺼낼 수 있다 (blob: 주소는 막는 브라우저가 있다)
  const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('HTML을 그림으로 바꾸지 못했어요'));
    i.src = src;
  });
  let url = '';
  try {
    let img: HTMLImageElement;
    try { img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); }
    catch { url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); img = await load(url); }
    // 사파리는 첫 그리기에서 안쪽 그림을 빼먹을 때가 있어 한 번 미리 그려 둔다
    const warm = document.createElement('canvas'); warm.width = 4; warm.height = 4;
    try { warm.getContext('2d')!.drawImage(img, 0, 0, 4, 4); } catch { /* 무시 */ }
    await new Promise(r => setTimeout(r, 60));
    const cv = document.createElement('canvas');
    cv.width = Math.round(width * scale); cv.height = Math.round(height * scale);
    const cx = cv.getContext('2d')!;
    // 배경 — 문서 배경색, 없으면 흰색
    const win = doc.defaultView!;
    const clear = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
    let bg = win.getComputedStyle(body).backgroundColor;
    if (clear(bg)) bg = win.getComputedStyle(html).backgroundColor;
    if (clear(bg)) bg = '#ffffff';
    cx.fillStyle = bg; cx.fillRect(0, 0, cv.width, cv.height);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
    if (!blob) throw new Error('이미지가 너무 커요 — 배율을 낮춰 주세요');
    return { blob, width: cv.width, height: cv.height, scale, missed };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
