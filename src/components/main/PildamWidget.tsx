'use client';
// 필담노트 위젯 (사용자 요청) — 지선우 · 춘열망 전용. 둘이 노트 한 장에 번갈아 적은 필담.
//  · 지선우: 어른 글씨, 조금 악필 — 나눔손글씨 펜 · 검남색 볼펜 · 글자마다 크게 흔들림
//  · 춘열망: 동그란 글씨 — 개구체 · 보라 젤펜 · 또박또박 조금만 흔들림
// 진짜 손글씨처럼 보이게: 글자마다 크기·기울기·높이·간격·잉크 농도를 조금씩 다르게(줄 id로 고정된 난수라
// 새로고침해도 모양이 같다), 획 가장자리는 SVG 필터로 살짝 울퉁불퉁, 줄마다 시작 위치·기울기도 조금씩.
// 「~~말~~」로 감싼 부분은 찍찍 그어 지운 것처럼, 줄 끝에는 낙서(♡·☆·달)와 여백 메모를 붙일 수 있다.
import React, { useEffect, useMemo, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { Modal } from '@/components/ui/Modal';
import { KSelect } from '@/components/ui/Kit';
import { newId } from '@/lib/postStore';

type Who = 'js' | 'cy';
type Doodle = '' | 'heart' | 'star' | 'moon';
export interface PildamLine { id: string; who: Who; text: string; doodle?: Doodle; note?: string }

const WHO_NAME: Record<Who, string> = { js: '지선우', cy: '춘열망' };
const DOODLES: { value: Doodle; label: string }[] = [
  { value: '', label: '낙서 없음' }, { value: 'heart', label: '♡ 하트' }, { value: 'star', label: '☆ 별' }, { value: 'moon', label: '☾ 달' },
];

const SAMPLE: PildamLine[] = [
  { id: 's1', who: 'js', text: '수업 언제 끝나냐' },
  { id: 's2', who: 'cy', text: '10분 남았어! 조금만 참아 ㅎㅎ' },
  { id: 's3', who: 'js', text: '배고파 ~~죽겠다~~ 배고파.' },
  { id: 's4', who: 'cy', text: '끝나고 떡볶이 먹으러 갈래?', doodle: 'heart' },
  { id: 's5', who: 'js', text: '네가 사.' },
  { id: 's6', who: 'cy', text: '치사해!! ><' },
  { id: 's7', who: 'js', text: '...그럼 내가 산다', note: '← 진짜임!!' },
  { id: 's8', who: 'cy', text: '헤헤 약속~', doodle: 'star' },
];

const linesOf = (conf: WidgetConf): PildamLine[] => {
  const v = conf.settings.lines;
  return Array.isArray(v) ? (v as PildamLine[]) : SAMPLE;
};

/** 손글씨 폰트는 이 위젯을 쓸 때만 불러온다 */
function useHandFonts() {
  useEffect(() => {
    if (document.getElementById('pd-fonts')) return;
    const l = document.createElement('link');
    l.id = 'pd-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Gaegu:wght@400&display=swap';
    document.head.appendChild(l);
  }, []);
}

/** 줄 id로 정해지는 난수 — 같은 줄은 늘 같은 모양 */
function rngOf(key: string) {
  let s = 0;
  for (let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) % 2147483647;
  s = s || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** 글자 하나하나를 조금씩 흔들어 그린다 */
function handChars(text: string, who: Who, r: () => number, keyBase: string) {
  const js = who === 'js';
  return Array.from(text).map((ch, i) => {
    if (ch === ' ') return <span key={keyBase + i} className="pd-sp" style={{ width: js ? 7 + r() * 5 : 8 + r() * 3 }} />;
    const rot = js ? -4 + r() * 7 : -2.5 + r() * 5;
    const dy = js ? -2.2 + r() * 4.4 : -1.2 + r() * 2.4;
    const sc = js ? 0.9 + r() * 0.22 : 0.94 + r() * 0.12;
    const sk = js ? -6 + r() * 4 : 0;
    const op = js ? 0.78 + r() * 0.22 : 0.86 + r() * 0.14;
    const kern = js ? -1.6 + r() * 1.4 : -0.4 + r() * 0.8;
    return (
      <span key={keyBase + i} style={{
        transform: `translateY(${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) skewX(${sk.toFixed(1)}deg) scale(${sc.toFixed(2)})`,
        opacity: +op.toFixed(2), marginRight: +kern.toFixed(1),
      }}>{ch}</span>
    );
  });
}

/** 찍찍 그은 줄 — 지운 말 위를 펜으로 왔다 갔다 직선으로 긋는다 */
function Scratch({ r }: { r: () => number }) {
  const n = 3 + Math.floor(r() * 2);
  let d = '';
  for (let i = 0; i < n; i++) {
    const y1 = 32 + r() * 36, y2 = 30 + r() * 40;
    d += i % 2 === 0 ? `M${(r() * 4).toFixed(1)},${y1.toFixed(1)} L${(96 + r() * 4).toFixed(1)},${y2.toFixed(1)} ` : `L${(r() * 5).toFixed(1)},${y1.toFixed(1)} `;
  }
  return (
    <svg className="pd-scratch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const DoodleSvg = ({ kind }: { kind: Doodle }) => kind === 'heart' ? (
  <svg className="pd-doodle" width="24" height="21" viewBox="0 0 26 22" aria-hidden><path d="M13 19.5 C3 12.5 1.8 5 7.6 3.4 C10.6 2.6 12.6 4.8 13.1 7.2 C13.7 4.6 15.8 2.4 18.9 3.3 C24.6 5 23 12.6 13.4 19.8" fill="none" stroke="#e584a8" strokeWidth="1.9" strokeLinecap="round" /></svg>
) : kind === 'star' ? (
  <svg className="pd-doodle" width="24" height="24" viewBox="0 0 24 24" aria-hidden><path d="M12 2.5l2.4 6.1 6.6.6-5 4.3 1.6 6.6L12 16.6 6.3 20.3l1.7-6.5-5.1-4.4 6.7-.4z" fill="#fde7a4" stroke="#d9a93a" strokeWidth="1.3" strokeLinejoin="round" /></svg>
) : kind === 'moon' ? (
  <svg className="pd-doodle" width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M15 3a9 9 0 1 0 6 15A7.5 7.5 0 0 1 15 3z" fill="#fff1c9" stroke="#e0bd62" strokeWidth="1.3" /></svg>
) : null;

function Line({ line }: { line: PildamLine }) {
  const parts = useMemo(() => {
    const r = rngOf(line.id + line.who);
    const js = line.who === 'js';
    const indent = js ? r() * 8 : 44 + r() * 10;
    const tilt = js ? -1.6 + r() * 1.2 : -0.6 + r() * 1.2;
    // ~~지운 말~~
    const segs = line.text.split(/~~(.+?)~~/);
    const body = segs.map((seg, i) => i % 2 === 1
      ? <span key={i} className="pd-struck">{handChars(seg, line.who, r, `${i}-`)}<Scratch r={r} /></span>
      : <React.Fragment key={i}>{handChars(seg, line.who, r, `${i}-`)}</React.Fragment>);
    const noteRot = -9 + r() * 6;
    return { indent, tilt, body, noteRot };
  }, [line.id, line.who, line.text]);
  return (
    <span className={`pd-l pd-${line.who}`} style={{ paddingLeft: Math.round(parts.indent), transform: `rotate(${parts.tilt.toFixed(2)}deg)` }}>
      <span className="pd-t">{parts.body}</span>
      {line.doodle && <DoodleSvg kind={line.doodle} />}
      {line.note?.trim() && <span className="pd-note" style={{ transform: `rotate(${parts.noteRot.toFixed(1)}deg)` }}>{line.note}</span>}
    </span>
  );
}

export function PildamWidget({ conf }: { conf: WidgetConf }) {
  useHandFonts();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === conf.id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [conf.id]);
  const lines = linesOf(conf);
  const date = typeof conf.settings.date === 'string' ? conf.settings.date : '10/18';
  return (
    <div className="panel widget pd-widget">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="pdRough"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="1.6" /></filter>
        <filter id="pdRough2"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="8" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="1.1" /></filter>
      </svg>
      <div className="pd-paper">
        <span className="pd-tape" aria-hidden />
        <span className="pd-holes" aria-hidden><i /><i /><i /><i /><i /><i /><i /><i /></span>
        {date.trim() && <span className="pd-date">{date}</span>}
        <div className="pd-body">
          {lines.length
            ? lines.map(l => <Line key={l.id} line={l} />)
            : <span className="pd-l pd-js pd-empty">아직 필담이 없어요</span>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="필담노트"
        desc="지선우·춘열망이 번갈아 적은 필담 — 줄을 추가하고 순서를 바꿀 수 있어요"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <PildamEditor conf={conf} />}
      </Modal>
    </div>
  );
}

export function PildamEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const lines = linesOf(conf);
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const setLines = (n: PildamLine[]) => set({ lines: n });
  const patch = (i: number, p: Partial<PildamLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lines.length) return;
    const n = [...lines];
    [n[i], n[j]] = [n[j], n[i]];
    setLines(n);
  };
  const date = typeof conf.settings.date === 'string' ? conf.settings.date : '10/18';
  return (
    <div className="pd-ed">
      <label className="pd-ed-row">
        <span className="cp-lb" style={{ minWidth: 40 }}>날짜</span>
        <input className="pd-ed-in" value={date} placeholder="예: 10/18 (비우면 안 보여요)" onChange={e => set({ date: e.target.value })} />
      </label>
      <p className="hint" style={{ margin: 0 }}>
        <b>~~지울 말~~</b>처럼 물결표 두 개로 감싸면 그 말 위에 찍찍 그은 줄이 생겨요 · 여백 메모는 줄 옆에 작게 적히는 낙서예요
      </p>
      <div className="pd-ed-list">
        {lines.map((l, i) => (
          <div key={l.id} className={`pd-ed-item ${l.who}`}>
            <button type="button" className="pd-ed-who" onClick={() => patch(i, { who: l.who === 'js' ? 'cy' : 'js' })} data-tip="눌러서 바꾸기">
              {WHO_NAME[l.who]}
            </button>
            <input className="pd-ed-in pd-ed-text" value={l.text} placeholder="내용" onChange={e => patch(i, { text: e.target.value })} />
            <div className="pd-ed-sub">
              <KSelect minWidth={110} value={l.doodle ?? ''} onChange={v => patch(i, { doodle: v as Doodle })} options={DOODLES} />
              <input className="pd-ed-in" value={l.note ?? ''} placeholder="여백 메모 (선택)" onChange={e => patch(i, { note: e.target.value })} />
              <button type="button" className="btn btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button>
              <button type="button" className="btn btn-ghost" disabled={i === lines.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button>
              <button type="button" className="btn btn-ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>삭제</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => setLines([...lines, { id: newId(), who: 'js', text: '' }])}>＋ 지선우</button>
        <button type="button" className="btn btn-ghost" onClick={() => setLines([...lines, { id: newId(), who: 'cy', text: '' }])}>＋ 춘열망</button>
      </div>
    </div>
  );
}
