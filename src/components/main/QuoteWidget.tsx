'use client';
// 오늘의 대사 위젯 (사용자 요청) — 관리자가 입력해 둔 문장 중 하나를 랜덤으로 보여 준다.
// 대사마다 말한 캐릭터를 고른다 (캐릭터 = 이름 + 얼굴 사진, 위젯 설정에서 관리).
// 캐릭터 페이지 이동은 없음 (사용자 요청).
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

/** 대사 — charId로 캐릭터를 가리킨다. who/img는 캐릭터 고르기 이전에 쓴 대사의 이름·사진 (그대로 보여 준다) */
export interface QuoteLine { id: string; text: string; charId?: string; who?: string; img?: string }
export interface QuoteChar { id: string; name: string; img?: string }

/** 기본 캐릭터 (사용자 제공 그림 — 얼굴 중심 정사각형 크롭, public/quote-chars) */
const DEFAULT_CHARS: QuoteChar[] = [
  { id: 'jsw', name: '지선우', img: '/quote-chars/1.webp' },
  { id: 'dove', name: '도브', img: '/quote-chars/2.webp' },
  { id: 'sio', name: '시오', img: '/quote-chars/3.webp' },          // 도브와 페어
  { id: 'chunym', name: '춘열망', img: '/quote-chars/4.webp' },     // 지선우와 페어
];
/** 저장된 캐릭터 + 나중에 추가된 기본 캐릭터 (지운 기본 캐릭터는 removedChars에 남겨 다시 안 나오게) */
const charsOf = (conf: WidgetConf) => {
  const saved = conf.settings.chars as QuoteChar[] | undefined;
  if (!saved) return DEFAULT_CHARS;
  const removed = (conf.settings.removedChars as string[] | undefined) ?? [];
  return [...saved, ...DEFAULT_CHARS.filter(d => !saved.some(c => c.id === d.id) && !removed.includes(d.id))];
};

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/** 사진 주소 — 사이트에 들어 있는 기본 그림(/quote-chars/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img);
  return fixed ?? blob;
}

/** 위젯 테마 (사용자 요청) — 같은 대사를 여러 모양으로 */
export const QUOTE_THEMES: { id: string; label: string }[] = [
  { id: 'bubble', label: '말풍선 (기본)' },
  { id: 'messenger', label: '메신저' },
  { id: 'vn', label: '게임 대화창' },
  { id: 'cinema', label: '영화 자막' },
  { id: 'card', label: '명대사 카드' },
  { id: 'letter', label: '편지지' },
  { id: 'memo', label: '메모지' },
];
/** 꾸밈 장식 (사용자 요청) — 켜 두면 화면에서 대사가 **두 줄 이하일 때만** 아래에 붙어 빈 곳을 채운다.
 *  기본은 꺼짐. 무늬는 한 줄로 쭉 이어지는 이모지 줄 중에서 고르거나 직접 입력 */
export const QUOTE_DECO: { id: string; label: string; pattern?: string }[] = [
  { id: 'off', label: '없음' },
  { id: 'sparkle', label: '˖᯽ ݁˖', pattern: '˖᯽ ݁˖' },
  { id: 'star', label: '⋆｡°✩', pattern: '⋆｡°✩' },
  { id: 'twinkle', label: '✧˖°', pattern: '✧˖°' },
  { id: 'heart', label: '·˚ ༘ ♡', pattern: '·˚ ༘ ♡' },
  { id: 'dot', label: '⊹ ࣪ ˖', pattern: '⊹ ࣪ ˖' },
  { id: 'flower', label: '❀ ⋆', pattern: '❀ ⋆' },
  { id: 'moon', label: '☾ ⋆ ✦', pattern: '☾ ⋆ ✦' },
  { id: 'quote', label: '“ 따옴표 · 날짜' },
  { id: 'custom', label: '직접 입력' },
];
const decoOf = (conf: WidgetConf) => {
  const d = conf.settings.decoStyle as string | undefined;
  return QUOTE_DECO.some(x => x.id === d) ? d! : 'off';
};
/** 고른 무늬 글자 — 직접 입력이면 입력한 글자 */
const decoPattern = (conf: WidgetConf, id: string) =>
  id === 'custom' ? String(conf.settings.decoText ?? '').trim() : QUOTE_DECO.find(x => x.id === id)?.pattern ?? '';

/** 무늬를 한 줄 가득 이어 붙인 줄 — 넘치는 건 잘린다 */
function DecoLine({ pattern, cls }: { pattern: string; cls: string }) {
  return <div className={`qt-deco-line ${cls}`} aria-hidden>{Array.from({ length: 40 }, () => pattern).join('  ')}</div>;
}

const themeOf = (conf: WidgetConf) => {
  const t = conf.settings.theme as string | undefined;
  return QUOTE_THEMES.some(x => x.id === t) ? t! : 'bubble';
};

/** 테마별 대사 모양 */
function QuoteBody({ theme, text, who, img }: { theme: string; text: string; who?: string; img?: string }) {
  switch (theme) {
    case 'messenger':
      return (
        <div className="qt-msg">
          <Face img={img} />
          <div className="qt-msg-col">
            {who && <div className="qt-msg-name">{who}</div>}
            <div className="qt-msg-bub"><span className="qt-t">{text}</span></div>
          </div>
        </div>
      );
    case 'vn':
      return (
        <div className="qt-vn">
          <Face img={img} cls="qt-vn-av" />
          <div className="qt-vn-box">
            {who && <span className="qt-vn-name">{who}</span>}
            <p className="qt-vn-txt"><span className="qt-t">{text}</span></p>
            <i className="qt-vn-next">▼</i>
          </div>
        </div>
      );
    case 'cinema':
      return (
        <div className="qt-cine">
          <p className="qt-cine-txt"><span className="qt-t">{text}</span></p>
          {who && <div className="qt-cine-who">{who}</div>}
        </div>
      );
    case 'card':
      return (
        <div className="qt-card">
          <i className="qt-card-mark">“</i>
          <p className="qt-card-txt"><span className="qt-t">{text}</span></p>
          {(who || img) && <div className="qt-card-who"><Face img={img} cls="qt-card-av" />{who}</div>}
        </div>
      );
    case 'letter':
      return (
        <div className="qt-letter">
          <p className="qt-letter-txt"><span className="qt-t">{text}</span></p>
          {who && <div className="qt-letter-sign">from. {who}</div>}
        </div>
      );
    case 'memo':
      return (
        <div className="qt-memo">
          <i className="qt-memo-pin" />
          <p className="qt-memo-txt"><span className="qt-t">{text}</span></p>
          {who && <div className="qt-memo-who">— {who}</div>}
        </div>
      );
    default:
      return (
        <div className="qt-body">
          <Face img={img} />
          <div className="qt-txt">
            <div className="qt-bub"><span className="qt-t">{text}</span></div>
            {who && <div className="qt-who">— {who}</div>}
          </div>
        </div>
      );
  }
}

function Face({ img, cls = 'qt-av' }: { img?: string; cls?: string }) {
  const src = usePic(img);
  if (!img) return null;
  return (
    <span className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </span>
  );
}

export function QuoteWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));
  const chars = charsOf(conf);
  const lines = ((conf.settings.lines as QuoteLine[]) ?? []).filter(l => l.text.trim());
  // 뽑기는 화면에 뜬 뒤에 — 서버 렌더와 어긋나지 않게
  const [pick, setPick] = useState<string | null>(null);
  const cur = lines.find(l => l.id === pick) ?? null;
  const ch = cur?.charId ? chars.find(c => c.id === cur.charId) : undefined;
  const who = ch ? ch.name : cur?.who;
  const img = ch ? ch.img : cur?.img;
  // 들어올 때마다 하나 뽑는다 (「다른 대사」 버튼은 사용자 요청으로 뺐다 — 새로 들어오면 바뀜)
  const draw = () => (lines.length ? lines[Math.floor(Math.random() * lines.length)].id : null);
  useEffect(() => {
    if (!cur && lines.length) setPick(draw());
  });

  // 화면에 보이는 대사가 몇 줄인지 — 글자 칸(span)이 줄마다 상자 하나씩 생기는 걸 센다
  const stageRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(0);
  useEffect(() => {
    const el = stageRef.current?.querySelector<HTMLElement>('.qt-t');
    if (!el) { setLineCount(0); return; }
    // 줄마다 상자가 생기지 않는 테마(글자 칸이 한 덩어리로 놓이는 경우)도 있어 높이 ÷ 줄 높이로 센다
    const count = () => {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || 20;
      const rects = Array.from(el.getClientRects()).filter(r => r.width > 0);
      // 글줄 안 조각(한글·문장부호 글꼴이 바뀌는 곳)마다 상자가 따로 생길 수 있어 줄 위치로 묶어 센다
      const n = cs.display === 'inline'
        ? rects.map(r => r.top).sort((x, y) => x - y).filter((t, i, a) => i === 0 || t - a[i - 1] > lh / 2).length
        : rects.reduce((sum, r) => sum + Math.max(1, Math.round(r.height / lh)), 0);
      setLineCount(n);
    };
    count();
    const ro = new ResizeObserver(count);
    ro.observe(stageRef.current!);
    return () => ro.disconnect();
  }, [cur?.id, cur?.text, conf.settings.theme]);
  const deco = decoOf(conf);
  const pattern = decoPattern(conf, deco);
  // 켜 뒀을 때, 화면에서 두 줄 이하인 짧은 대사에만 (세 줄 이상이면 꾸밈 없이)
  const showDeco = !!cur && deco !== 'off' && lineCount > 0 && lineCount <= 2 && (deco === 'quote' || !!pattern);
  const [today, setToday] = useState('');
  useEffect(() => { const d = new Date(); setToday(`${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`); }, []);

  return (
    <div className={`panel widget qt-widget qt-t-${themeOf(conf)}`}>
      <h4>TODAY&apos;S LINE {isAdmin && <span className="more" onClick={e => { e.stopPropagation(); if (!editOn) setOpen(true); }}>설정 ›</span>}</h4>
      {cur ? (
        // 대사는 위젯 위아래 한가운데에 — 짧은 대사도 아래가 텅 비어 보이지 않게 (사용자 요청)
        <div className={`qt-stage ${showDeco ? 'deco' : ''}`} ref={stageRef}>
          <QuoteBody theme={themeOf(conf)} text={cur.text} who={who} img={img} />
          {showDeco && deco === 'quote' && <div className="qt-deco-bottom" aria-hidden>— TODAY&apos;S LINE{today && ` · ${today}`} —</div>}
          {showDeco && deco !== 'quote' && <DecoLine pattern={pattern} cls="bottom" />}
        </div>
      ) : (
        <p className="hint">{isAdmin ? '「설정 ›」에서 대사를 입력해 주세요' : '아직 대사가 없습니다'}</p>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="오늘의 대사"
        desc="입력해 둔 대사 중 하나가 랜덤으로 떠요 — 대사마다 말한 캐릭터를 골라 주세요"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <QuoteEditor conf={conf} />}
      </Modal>
    </div>
  );
}

/** 캐릭터 한 줄 — 얼굴 사진(누르면 바꾸기) · 이름 · 삭제 */
function CharRow({ c, patch, del }: { c: QuoteChar; patch: (p: Partial<QuoteChar>) => void; del: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = usePic(c.img);
  const [busy, setBusy] = useState(false);
  return (
    <div className="qt-char-row">
      <button type="button" className="qt-pic" title={c.img ? '사진 바꾸기' : '사진 넣기'}
        onClick={() => { if (!busy) fileRef.current?.click(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span>{busy ? '…' : '＋'}</span>}
      </button>
      <input data-crop="1:1" ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { patch({ img: await putBlob(f) }); } catch (err) { toast(`사진을 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          setBusy(false);
        }} />
      <KInput value={c.name} placeholder="캐릭터 이름" style={{ flex: 1 }} onChange={e => patch({ name: e.target.value })} />
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }} onClick={del}>DELETE</button>
    </div>
  );
}

export function QuoteEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const chars = charsOf(conf);
  const lines = (conf.settings.lines as QuoteLine[]) ?? [];
  const set = (p: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const setLines = (next: QuoteLine[]) => set({ lines: next });
  const setChars = (next: QuoteChar[]) => set({ chars: next });
  const options = [
    { value: '', label: '캐릭터 없음' },
    ...chars.map(c => ({
      value: c.id,
      label: <span className="qt-opt"><Face img={c.img} cls="qt-opt-av" />{c.name || '(이름 없음)'}</span>,
    })),
  ];

  return (
    <div>
      <span className="cp-lb">테마</span>
      <div className="qt-themes">
        {QUOTE_THEMES.map(t => (
          <button key={t.id} type="button" className={`qt-theme-chip ${themeOf(conf) === t.id ? 'on' : ''}`}
            onClick={() => set({ theme: t.id })}>{t.label}</button>
        ))}
      </div>
      <span className="cp-lb" style={{ display: 'block', marginTop: 14 }}>꾸밈 장식 — 대사가 두 줄 이하일 때 아래에 한 줄</span>
      <div className="qt-themes">
        {QUOTE_DECO.map(t => (
          <button key={t.id} type="button" className={`qt-theme-chip ${decoOf(conf) === t.id ? 'on' : ''}`}
            onClick={() => set({ decoStyle: t.id })}>{t.label}</button>
        ))}
      </div>
      {decoOf(conf) === 'custom' && (
        <KInput value={String(conf.settings.decoText ?? '')} placeholder="반복할 무늬 — 예: ✿ ⋆ ˚" style={{ width: '100%', marginTop: 6 }}
          onChange={e => set({ decoText: e.target.value })} />
      )}
      <span className="cp-lb" style={{ display: 'block', marginTop: 14 }}>캐릭터</span>
      <div className="qt-chars">
        {chars.map(c => (
          <CharRow key={c.id} c={c}
            patch={p => setChars(chars.map(x => (x.id === c.id ? { ...x, ...p } : x)))}
            del={() => set({
              chars: chars.filter(x => x.id !== c.id),
              ...(DEFAULT_CHARS.some(d => d.id === c.id)
                ? { removedChars: [...((conf.settings.removedChars as string[] | undefined) ?? []), c.id] } : {}),
            })} />
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => setChars([...chars, { id: uid('c'), name: '' }])}>＋ 캐릭터 추가</button>
      </div>

      <span className="cp-lb" style={{ display: 'block', marginTop: 16 }}>대사</span>
      {lines.length === 0 && <p className="hint" style={{ margin: '6px 0' }}>아직 대사가 없어요 — 아래 버튼으로 추가해 주세요</p>}
      <DragList items={lines} keyOf={l => l.id} onReorder={setLines}
        render={l => {
          const patch = (p: Partial<QuoteLine>) => setLines(lines.map(x => (x.id === l.id ? { ...x, ...p } : x)));
          return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
              <span className="drag-h" style={{ paddingTop: 7 }}>⠿</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <KTextarea value={l.text} rows={1} style={{ minHeight: 34 }} placeholder="대사"
                  onChange={e => patch({ text: e.target.value })} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <KSelect minWidth={150} value={l.charId && chars.some(c => c.id === l.charId) ? l.charId : ''}
                    onChange={v => patch({ charId: v || undefined, who: undefined, img: undefined })}
                    options={options} />
                  {!l.charId && l.who && <span className="hint">예전 이름: {l.who}</span>}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, flexShrink: 0 }}
                onClick={() => setLines(lines.filter(x => x.id !== l.id))}>DELETE</button>
            </div>
          );
        }} />
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
        onClick={() => setLines([...lines, { id: uid('q'), text: '', charId: lines[lines.length - 1]?.charId ?? chars[0]?.id }])}>＋ 대사 추가</button>
    </div>
  );
}
