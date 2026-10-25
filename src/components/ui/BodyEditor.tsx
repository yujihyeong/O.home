'use client';
// 글 편집기 (사용자 요청 — 감상타래에서도 글쓰기 기능 전부) — 게시판 글쓰기와 같은 모드·도구를 한 덩어리로.
// 에디터 · Markdown · 로그 정리 · HTML(코드/미리보기 편집) + 맞춤법·글씨체·이미지 올리기 + 실시간 미리보기
import React, { useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { RichEditor } from '@/components/ui/RichEditor';
import { TextTools, WholeFont, wholeFontStyle } from '@/components/ui/WriteTools';
import { KTextarea } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useFonts } from '@/lib/fontStore';
import { renderBody } from '@/lib/sanitize';
import { putBlob } from '@/lib/blobStore';
import { stripImageMetaInfo } from '@/lib/imageMeta';

export type WriteMode = 'editor' | 'md' | 'html' | 'log';

/** 저장할 렌더 방식·작성 도구 */
export const saveModeOf = (m: WriteMode) => ({
  mode: (m === 'md' || m === 'log' ? 'md' : 'html') as 'md' | 'html',
  authored: m === 'editor' ? 'editor' as const : m === 'log' ? 'log' as const : undefined,
});
/** 저장된 글을 다시 열 모드 */
export const modeOf = (mode?: 'md' | 'html', authored?: 'editor' | 'log'): WriteMode =>
  (mode === 'md' ? (authored === 'log' ? 'log' : 'md') : authored === 'editor' ? 'editor' : 'html');

/** 에디터가 다루지 못해 정리될 만한 태그·속성이 있는가 — 전환 경고 판단 */
const hasRichHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|div|span|section|article|video|audio|details|summary|font|center)\b/i.test(html)
  || /\s(style|class|id)\s*=/i.test(html);

function toDataUrl(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** 단어 바꾸기 — 글자만 바꾸고 HTML 태그(<…>) 안은 건드리지 않는다. [바뀐 글, 바꾼 수] */
/** 검게 가리기에 쓰는 상자 글자 */
const BLOCK = '█';

export function replaceWord(text: string, from: string, to: string): [string, number] {
  if (!from) return [text, 0];
  let n = 0;
  const out = text.split(/(<[^>]*>)/).map((part, i) => {
    if (i % 2 === 1) return part;
    const c = part.split(from).length - 1;
    n += c;
    return c ? part.split(from).join(to) : part;
  }).join('');
  return [out, n];
}

export function BodyEditor({ value, onChange, mode, onMode, whole, onWhole, minHeight = 160, preview = true, replace = false }: {
  value: string; onChange: (v: string) => void;
  mode: WriteMode; onMode: (m: WriteMode) => void;
  whole: WholeFont; onWhole: (w: WholeFont) => void;
  minHeight?: number; preview?: boolean;
  /** 단어 바꾸기 칸 + 검게 가리기 (사용자 요청 — 감상타래 글쓰기) */
  replace?: boolean;
}) {
  const toast = useToast();
  const { familyOf } = useFonts();
  const [htmlView, setHtmlView] = useState<'code' | 'preview'>('code');
  const [askRich, setAskRich] = useState<null | (() => void)>(null);
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const doReplace = () => {
    const from = rFrom.trim();
    if (!from) { toast('바꿀 단어를 적어 주세요'); return; }
    const [next, n] = replaceWord(value, from, rTo);
    if (!n) { toast(`본문에 「${from}」이(가) 없어요`); return; }
    onChange(next);
    toast(`「${from}」 ${n}곳을 「${rTo}」(으)로 바꿨어요`);
  };
  /* 검게 가리기 (사용자 요청) — 드래그한 부분을 글자 수만큼 ▇ 상자로. 줄바꿈은 그대로 둔다 */
  const rootRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<Editor | null>(null);
  const redact = () => {
    const rich = mode === 'editor' || (mode === 'html' && htmlView === 'preview');
    if (rich) {
      const ed = edRef.current;
      if (!ed) return;
      const { from, to } = ed.state.selection;
      if (from === to) { toast('가릴 부분을 드래그해 주세요'); return; }
      // 글 조각마다 같은 길이로 바꾼다 — 문단 경계·굵게 같은 꾸밈은 그대로
      const parts: [number, number, string][] = [];
      ed.state.doc.nodesBetween(from, to, (n, pos) => {
        if (!n.isText || !n.text) return;
        const a = Math.max(from, pos), b = Math.min(to, pos + n.text.length);
        if (b > a) parts.push([a, b, BLOCK.repeat([...n.text.slice(a - pos, b - pos)].length)]);
      });
      if (!parts.length) return;
      const tr = ed.state.tr;
      for (const [a, b, t] of parts.reverse()) tr.insertText(t, a, b);
      ed.view.dispatch(tr);
      ed.commands.focus();
      return;
    }
    const ta = rootRef.current?.querySelector('textarea');
    if (!ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) { toast('가릴 부분을 드래그해 주세요'); return; }
    const hidden = value.slice(a, b).replace(/[^\n]/gu, BLOCK);
    onChange(value.slice(0, a) + hidden + value.slice(b));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a, a + hidden.length); });
  };
  const font = { whole, setWhole: onWhole };
  const isMd = mode === 'md' || mode === 'log';
  const html = useMemo(() => (preview ? renderBody(isMd ? 'md' : 'html', value) : ''), [preview, isMd, value]);

  /** 이미지 올리기 — 메타데이터를 지우고, 지웠으면 위쪽에 짧게 알린다 */
  const upload = async (files: File[]) => {
    const added: string[] = [];
    let removed = 0;
    for (const f of files) {
      const { blob, removed: rm } = await stripImageMetaInfo(f);
      if (rm) removed += 1;
      const ref = await putBlob(blob);
      added.push(/^https?:/.test(ref) ? ref : await toDataUrl(blob));
    }
    if (removed) toast(`이미지 메타데이터를 지웠어요${files.length > 1 ? ` (${removed}장)` : ''}`, { top: true });
    return added;
  };

  const ta = (
    <KTextarea
      style={{ minHeight, fontFamily: mode === 'html' ? 'ui-monospace, Consolas, monospace' : undefined }}
      placeholder={mode === 'log'
        ? '로그를 붙여넣고 [로그 정리]를 누르세요 — *지문*처럼 마크다운이 있는 줄은 그대로, 나머지 문장은 ""로 감쌉니다'
        : mode === 'md' ? '마크다운으로 작성...' : '<div>HTML 코드를 작성/붙여넣기...</div>'}
      value={value} onChange={e => onChange(e.target.value)}
    />
  );
  return (
    <div className="body-ed" ref={rootRef}>
      <div className="body-ed-modes">
        <div className="mini-seg">
          <button type="button" className={mode === 'editor' ? 'on' : ''} onClick={() => {
            if (mode === 'html' && hasRichHtml(value)) { setAskRich(() => () => onMode('editor')); return; }
            onMode('editor');
          }}>에디터</button>
          <button type="button" className={mode === 'md' ? 'on' : ''} onClick={() => { onMode('md'); setHtmlView('code'); }}>Markdown</button>
          <button type="button" className={mode === 'log' ? 'on' : ''} onClick={() => { onMode('log'); setHtmlView('code'); }}
            data-tip="로그를 붙여넣고 [로그 정리] — 마크다운으로 저장">로그 정리</button>
          <button type="button" className={mode === 'html' ? 'on' : ''} onClick={() => onMode('html')}>HTML</button>
        </div>
        {mode === 'html' && (
          <div className="mini-seg">
            <button type="button" className={htmlView === 'code' ? 'on' : ''} onClick={() => setHtmlView('code')}>코드</button>
            <button type="button" className={htmlView === 'preview' ? 'on' : ''} onClick={() => {
              if (htmlView === 'preview') return;
              if (hasRichHtml(value)) { setAskRich(() => () => setHtmlView('preview')); return; }
              setHtmlView('preview');
            }}>미리보기 (편집 가능)</button>
          </div>
        )}
      </div>
      {replace && (
        /* 단어 바꾸기 (사용자 요청) — 예: 체리 → 그녀, 본문의 그 단어를 전부 */
        <div className="body-ed-rep">
          <span>단어 바꾸기</span>
          <input className="k-input" value={rFrom} placeholder="바꿀 단어" onChange={e => setRFrom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); doReplace(); } }} />
          <b aria-hidden>→</b>
          <input className="k-input" value={rTo} placeholder="새 단어" onChange={e => setRTo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); doReplace(); } }} />
          <button type="button" className="btn btn-ghost" onClick={doReplace}>모두 바꾸기</button>
          <i className="body-ed-sep" aria-hidden />
          <button type="button" className="btn btn-ghost body-ed-redact" onMouseDown={e => e.preventDefault()} onClick={redact}
            data-tip="드래그한 부분을 글자 수만큼 검은 상자로"><span aria-hidden>▇▇</span> 검게 가리기</button>
        </div>
      )}
      {mode === 'editor' || (mode === 'html' && htmlView === 'preview') ? (
        <RichEditor value={value} onChange={onChange} font={font} placeholder="내용을 작성하세요 — 이미지 삽입 가능"
          onReady={e => { edRef.current = e; }} />
      ) : (
        <>
          {isMd
            ? <TextTools value={value} onChange={onChange} log={mode === 'log'} font={font} upload={upload}>{ta}</TextTools>
            : <TextTools value={value} onChange={onChange} spell={false} font={{ ...font, html: true }}>{ta}</TextTools>}
          {preview && value.trim() && (
            <div className="preview-box" style={{ marginTop: 10 }}>
              <div className="pv-label">PREVIEW</div>
              <div className="post-body" style={wholeFontStyle(familyOf, whole)} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </>
      )}
      <ConfirmModal open={askRich !== null} title="여기서 편집하면 일부 태그가 정리됩니다"
        body="에디터는 굵게·목록·제목·이미지 같은 기본 서식만 다룹니다. 표·div·style·class 등은 편집하는 순간 정리되며 되돌릴 수 없습니다. HTML을 그대로 두려면 취소하세요."
        onClose={() => setAskRich(null)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAskRich(null) },
          { label: '계속', kind: 'accent', onClick: () => { askRich?.(); setAskRich(null); } },
        ]} />
    </div>
  );
}
