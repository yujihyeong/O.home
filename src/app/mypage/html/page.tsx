'use client';
// HTML 편집기 (사용자 요청 — 마이페이지, 예전 이름 HTML 이미지 편집기) — HTML을 붙여 넣거나 .html 파일을 열면 오른쪽에 미리보기.
// 미리보기의 글자를 누르면 바로 고치고, 그림을 누르면 바꾼다. 고친 내용은 왼쪽 코드에도 그대로 반영된다.
// 저장: HTML 파일 / HTML 복사 / 고화질 PNG (HTML 자체를 다시 그린다 — 화면 캡처가 아님, lib/htmlToImage).
// 안전: 미리보기는 스크립트를 막은 iframe(sandbox, allow-same-origin만) — 붙여 넣은 HTML 속 코드는 실행되지 않는다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { KInput } from '@/components/ui/Kit';
import { PageTitle } from '@/components/ui/PageText';
import { renderDocToPng, maxScaleFor, docWidth } from '@/lib/htmlToImage';

const KEY = 'ohome.htmlimg.v1';

/** 작은 선 아이콘 */
const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const SAMPLE = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 40px; background: #fdf3f4; font-family: 'Noto Sans KR', sans-serif; }
  .card { width: 480px; margin: 0 auto; padding: 32px; border-radius: 20px; background: #fff; box-shadow: 0 10px 30px rgba(200,120,140,.18); text-align: center; }
  h1 { margin: 0 0 10px; color: #c85a72; font-size: 26px; }
  p { margin: 0; color: #6a4a52; line-height: 1.8; }
</style>
</head>
<body>
  <div class="card">
    <h1>여기를 눌러 제목을 고쳐 보세요</h1>
    <p>미리보기의 글자를 누르면 바로 고칠 수 있어요.<br>다 고치면 아래 [이미지 저장]으로 PNG를 받을 수 있어요.</p>
  </div>
</body>
</html>`;

/** 편집 중에만 미리보기에 넣는 표시 — 저장할 땐 빠진다 */
const EDIT_CSS = `[data-ohx-img]{cursor:pointer}
[data-ohx-img]:hover{outline:3px dashed #d97f97;outline-offset:2px}
[data-ohx-text]{cursor:text}
[data-ohx-text]:hover{outline:2px dashed #d97f97;outline-offset:2px;background:rgba(217,127,151,.07)}
[data-ohx-on]{outline:2px solid #d97f97 !important;outline-offset:2px}
html[data-ohx-off] [data-ohx-img]:hover,html[data-ohx-off] [data-ohx-text]:hover{outline:none;background:none}`;

const BLOCKS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'UL', 'OL', 'TABLE', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'FIGURE', 'MAIN', 'ASIDE', 'FORM']);

function markEditable(doc: Document) {
  doc.querySelectorAll('img').forEach(el => el.setAttribute('data-ohx-img', ''));
  doc.body?.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (el.hasAttribute('data-ohx-img')) return;
    const bg = doc.defaultView?.getComputedStyle(el).backgroundImage ?? '';
    if (bg.startsWith('url(')) { el.setAttribute('data-ohx-img', 'bg'); return; }
    if (!el.textContent?.trim()) return;
    if (Array.from(el.children).some(c => BLOCKS.has(c.tagName.toUpperCase()))) return;
    // 바깥 글 묶음만 — 안쪽 <b>·<span> 등은 바깥과 함께 고친다
    if (el.parentElement?.closest('[data-ohx-text]')) return;
    el.setAttribute('data-ohx-text', '');
  });
}

/** 편집 표시를 걷어 낸 HTML */
function cleanHtml(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll('[data-ohx-edit]').forEach(n => n.remove());
  root.removeAttribute('data-ohx-off');
  root.querySelectorAll('[data-ohx-img],[data-ohx-text],[data-ohx-on],[contenteditable]').forEach(n => {
    n.removeAttribute('data-ohx-img'); n.removeAttribute('data-ohx-text'); n.removeAttribute('data-ohx-on'); n.removeAttribute('contenteditable');
  });
  const dt = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : '';
  return dt + root.outerHTML;
}

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(f);
});

export default function HtmlImagePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [doc, setDoc] = useState('');            // iframe에 실제로 넣은 글 — 코드를 고칠 때만 바꾼다
  const [ready, setReady] = useState(false);
  const [edit, setEdit] = useState(true);
  const [fold, setFold] = useState(false);
  const [tab, setTab] = useState<'code' | 'view'>('view');
  const [width, setWidth] = useState('');        // 미리보기 폭(px) — 비우면 칸에 맞춤
  const [name, setName] = useState('html-image');
  const [scale, setScale] = useState(4);
  const [busy, setBusy] = useState('');
  const [imgEl, setImgEl] = useState<HTMLElement | null>(null);
  const [imgUrl, setImgUrl] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const picRef = useRef<HTMLInputElement>(null);
  const editRef = useRef(edit);
  editRef.current = edit;

  // 처음 — 적어 두었던 코드가 있으면 이어서, 없으면 보기 예시
  useEffect(() => {
    let v = '';
    try { v = localStorage.getItem(KEY) ?? ''; } catch { /* 무시 */ }
    const c = v || SAMPLE;
    setCode(c); setDoc(c); setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { try { localStorage.setItem(KEY, code); } catch { /* 너무 크면 이 브라우저엔 못 남긴다 */ } }, 600);
    return () => clearTimeout(t);
  }, [code, ready]);

  // 코드를 고치면 잠깐 뒤에 미리보기를 다시 그린다
  const typing = useRef<number>(0);
  const onCode = (v: string) => {
    setCode(v);
    clearTimeout(typing.current);
    typing.current = window.setTimeout(() => setDoc(v), 500);
  };

  const syncFromPreview = useCallback(() => {
    const d = frame.current?.contentDocument;
    if (d) setCode(cleanHtml(d));
  }, []);

  // 미리보기 크기 — 높이는 내용에 맞추고(바깥 칸이 스크롤), 폭이 자동인데 내용이 칸보다 넓으면
  // (휴대폰에서 고정 폭 카드 등) 내용 폭 그대로 그린 뒤 칸에 맞게 줄여 보여 준다. 저장 이미지는 원래 크기
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, h: 0, k: 1 });
  useEffect(() => { setFit({ w: 0, h: 0, k: 1 }); }, [doc, width]);
  useEffect(() => {
    const t = setInterval(() => {
      const f = frame.current, d = f?.contentDocument, b = box.current;
      if (!f || !b || !d?.documentElement) return;
      const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0);
      const avail = b.clientWidth;
      setFit(o => {
        let w = o.w;
        if (!width) {
          const sw = docWidth(d);
          // 칸보다 넓을 때만 넓힌다 (줄이지 않는다 — 넓혔다 줄였다 반복하지 않게)
          if (sw > Math.max(avail, w) + 1) w = sw;
        }
        const k = !width && w > avail ? avail / w : 1;
        return Math.abs(o.h - h) > 2 || o.w !== w || Math.abs(o.k - k) > 0.001 ? { w, h, k } : o;
      });
    }, 400);
    return () => clearInterval(t);
  }, [width]);

  // 미리보기가 다 읽히면 — 편집 표시를 붙이고 누르기를 받는다
  const onLoad = () => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) return;
    const st = d.createElement('style');
    st.setAttribute('data-ohx-edit', '');
    st.textContent = EDIT_CSS;
    (d.head ?? d.documentElement).appendChild(st);
    d.documentElement.toggleAttribute('data-ohx-off', !editRef.current);
    markEditable(d);
    const end = (el: HTMLElement) => {
      el.removeAttribute('contenteditable'); el.removeAttribute('data-ohx-on');
      syncFromPreview();
    };
    d.addEventListener('click', e => {
      const t = e.target as HTMLElement | null;
      // 링크로 미리보기가 다른 곳으로 넘어가지 않게
      if (t?.closest('a')) e.preventDefault();
      if (!editRef.current || !t) return;
      const img = t.closest<HTMLElement>('[data-ohx-img]');
      if (img) {
        e.preventDefault(); e.stopPropagation();
        setImgUrl(img.tagName === 'IMG' ? (img.getAttribute('src')?.startsWith('data:') ? '' : img.getAttribute('src') ?? '') : '');
        setImgEl(img);
        return;
      }
      const tx = t.closest<HTMLElement>('[data-ohx-text]');
      if (tx && tx.getAttribute('contenteditable') !== 'true') {
        e.preventDefault();
        tx.setAttribute('contenteditable', 'true'); tx.setAttribute('data-ohx-on', '');
        tx.focus();
      }
    }, true);
    d.addEventListener('focusout', e => {
      const el = e.target as HTMLElement;
      if (el?.getAttribute?.('contenteditable') === 'true') end(el);
    }, true);
    d.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const el = d.querySelector<HTMLElement>('[contenteditable="true"]');
      if (el) { el.blur(); }
    });
    d.addEventListener('submit', e => e.preventDefault(), true);
  };
  useEffect(() => { frame.current?.contentDocument?.documentElement?.toggleAttribute('data-ohx-off', !edit); }, [edit]);

  const applyImg = (url: string) => {
    if (!imgEl || !url) return;
    if (imgEl.getAttribute('data-ohx-img') === 'bg') imgEl.style.backgroundImage = `url("${url}")`;
    else { imgEl.setAttribute('src', url); imgEl.removeAttribute('srcset'); }
    setImgEl(null);
    syncFromPreview();
  };

  const openFile = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const t = String(r.result);
      setCode(t); setDoc(t);
      setName(f.name.replace(/\.html?$/i, '') || 'html-image');
      toast('불러왔어요 — 다른 파일에 있던 그림(상대 주소)은 안 보일 수 있어요. 그림을 눌러 바꿔 주세요');
    };
    r.readAsText(f, 'utf-8');
  };

  const fname = (ext: string) => `${(name.trim() || 'html-image').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)}.${ext}`;
  const download = (blob: Blob, n: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = n;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const latest = () => { const d = frame.current?.contentDocument; return d?.documentElement ? cleanHtml(d) : code; };
  const saveHtml = () => { download(new Blob([latest()], { type: 'text/html;charset=utf-8' }), fname('html')); toast('HTML 파일로 저장했어요'); };
  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(latest()); toast('HTML 코드를 복사했어요'); }
    catch { toast('복사가 막혀 있어요 — 왼쪽 코드 칸에서 직접 복사해 주세요'); }
  };
  const saveImage = async () => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) { toast('미리보기가 아직 준비되지 않았어요'); return; }
    // 편집 중인 글은 먼저 마무리
    d.querySelector<HTMLElement>('[contenteditable="true"]')?.blur();
    d.documentElement.setAttribute('data-ohx-off', '');
    setBusy('준비 중…');
    try {
      const r = await renderDocToPng(d, scale, setBusy);
      const file = new File([r.blob], fname('png'), { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
      if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* 취소 */ }
      } else download(r.blob, file.name);
      toast(`PNG로 저장했어요 — ${r.width}×${r.height}px (${Math.round(r.scale * 100) / 100}배)${r.missed ? ` · 그림 ${r.missed}개는 그 사이트가 막아 빠졌어요` : ''}`);
    } catch (e) {
      toast(`이미지로 저장하지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      d.documentElement.toggleAttribute('data-ohx-off', !editRef.current);
      setBusy('');
    }
  };

  // 지금 미리보기 크기에서 고를 수 있는 가장 큰 배율 (표시용)
  const [cap, setCap] = useState(4);
  useEffect(() => {
    const t = setInterval(() => {
      const d = frame.current?.contentDocument;
      if (!d?.documentElement) return;
      const w = docWidth(d), h = Math.max(d.documentElement.scrollHeight, 1);
      setCap(Math.round(maxScaleFor(w, h) * 100) / 100);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href="/mypage">HTML 편집기</PageTitle><p>로그인 후 이용할 수 있습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page hx-page">
      <div className="page-head">
        <PageTitle href="/mypage">HTML 편집기</PageTitle>
        <p>HTML을 붙여 넣거나 파일을 열어, 보면서 고치고 고화질 이미지로 저장해요</p>
      </div>

      <div className="hx-card">
        {/* 도구 줄 */}
        <div className="hx-bar">
          <button type="button" className="hx-btn" onClick={() => fileRef.current?.click()}>
            <Ico d="M4 5h6l2 2h8v12H4z" />파일 열기
          </button>
          <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={e => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className={`hx-switch ${edit ? 'on' : ''}`} onClick={() => setEdit(v => !v)} aria-pressed={edit}
            data-tip="켜면 미리보기의 글자·그림을 눌러 고쳐요">
            <i />눌러서 고치기
          </button>
          <span className="hx-sep" />
          <button type="button" className="hx-btn hx-fold" onClick={() => setFold(v => !v)}>
            <Ico d={fold ? 'M4 5h16v14H4zM10 5v14' : 'M4 5h16v14H4zM10 5v14M7 10l-2 2 2 2'} />{fold ? '코드 보기' : '코드 숨기기'}
          </button>
          <label className="hx-w" data-tip="미리보기·이미지의 가로 폭 — 비우면 칸에 맞춰요">
            <Ico d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" />
            <input inputMode="numeric" value={width} placeholder="자동" maxLength={5}
              onChange={e => setWidth(e.target.value.replace(/\D/g, ''))} aria-label="미리보기 폭(px)" />
            <span>px</span>
          </label>
          <span className="hx-grow" />
          <button type="button" className="hx-link" onClick={() => { if (confirm('보기 예시로 되돌릴까요? 지금 코드는 지워져요')) { setCode(SAMPLE); setDoc(SAMPLE); } }}>예시로 되돌리기</button>
        </div>

        {/* 휴대폰 — 코드 / 미리보기를 탭으로 */}
        <div className="hx-tabs">
          <button type="button" className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>코드</button>
          <button type="button" className={tab === 'view' ? 'on' : ''} onClick={() => setTab('view')}>미리보기</button>
        </div>

        <div className={`hx-main ${fold ? 'fold' : ''}`} data-tab={tab}>
          <div className="hx-pane hx-code">
            <div className="hx-ttl"><b>CODE</b><small>직접 고쳐도 바로 반영돼요</small></div>
            <textarea value={code} onChange={e => onCode(e.target.value)} spellCheck={false}
              placeholder="여기에 HTML을 붙여 넣거나, 위에서 파일을 열어 주세요" aria-label="HTML 코드" />
          </div>
          <div className="hx-pane hx-view">
            <div className="hx-ttl"><b>PREVIEW</b><small>{edit ? '글자·그림을 눌러 고치기 · Esc로 마치기' : '고치기 꺼짐'}{fit.k < 1 ? ` · ${Math.round(fit.k * 100)}%로 줄여 보는 중` : ''}</small></div>
            <div className="hx-scroll" ref={box}>
              {ready && (
                <div className="hx-fit" style={fit.k < 1 ? { width: fit.w * fit.k, height: fit.h * fit.k } : undefined}>
                  <iframe ref={frame} title="HTML 미리보기" sandbox="allow-same-origin" srcDoc={doc} onLoad={onLoad}
                    style={{
                      width: width ? `${width}px` : fit.w ? `${fit.w}px` : '100%',
                      height: fit.h ? `${fit.h}px` : undefined,
                      ...(fit.k < 1 ? { transform: `scale(${fit.k})`, transformOrigin: '0 0' } : {}),
                    }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 저장 줄 */}
        <div className="hx-save">
          <label className="hx-name">
            <span>파일 이름</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} aria-label="파일 이름" />
          </label>
          <div className="hx-scale">
            <span>화질</span>
            <div className="hx-seg">
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button" className={scale === n ? 'on' : ''} onClick={() => setScale(n)}>{n}×{n === 4 && <em>최고</em>}</button>
              ))}
            </div>
            {scale > cap && <small>이 크기에선 {cap}배까지 — 자동으로 맞춰요</small>}
          </div>
          <span className="hx-grow" />
          <button type="button" className="hx-btn" onClick={() => { void copyHtml(); }}><Ico d="M9 9h10v10H9zM5 15V5h10" />HTML 복사</button>
          <button type="button" className="hx-btn" onClick={saveHtml}><Ico d="M8 8l-4 4 4 4M16 8l4 4-4 4" />HTML 저장</button>
          <button type="button" className="hx-btn hx-primary" disabled={!!busy} onClick={() => { void saveImage(); }}>
            <Ico d="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01" />{busy || '이미지 저장'}
          </button>
        </div>
      </div>

      {/* 그림 바꾸기 — 주소 또는 내 사진 */}
      <Modal open={!!imgEl} onClose={() => setImgEl(null)} small title="그림 바꾸기"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setImgEl(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => applyImg(imgUrl.trim())} disabled={!imgUrl.trim()}>주소로 바꾸기</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => picRef.current?.click()}>내 사진에서 고르기</button>
          <input ref={picRef} type="file" accept="image/*" hidden
            onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) applyImg(await readAsDataUrl(f)); }} />
          <KInput value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="또는 그림 주소(https://…)" />
          <p className="hint" style={{ margin: 0 }}>내 사진은 HTML 안에 바로 담겨요 · 다른 사이트 그림은 그 사이트가 막으면 이미지 저장 때 빠질 수 있어요</p>
        </div>
      </Modal>
    </section>
  );
}
