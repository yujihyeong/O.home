'use client';
// 가이딩 파장 위젯 (사용자 요청 — 센티넬버스 커플 도브·시오, 밤 컨셉)
// 센티넬의 흔들리는 파장이 가이드의 잔잔한 파장에 맞춰 겹쳐지는 모습. 「파장 일치율」만 바꾸면
// 파장의 흔들림·색·상태 글자가 알아서 바뀐다 (21% 불안정 → 64% 가이딩 중 → 99% 완전 동조).
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KInput, KSelect, KToggle } from '@/components/ui/Kit';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

type Role = 'sentinel' | 'guide';
interface WavePerson { name: string; role: Role; img?: string }

const DEFAULT_A: WavePerson = { name: '도브', role: 'sentinel', img: '/quote-chars/2.webp' };
const DEFAULT_B: WavePerson = { name: '시오', role: 'guide', img: '/quote-chars/3.webp' };
const ROLE_LABEL: Record<Role, string> = { sentinel: '센티넬', guide: '가이드' };

const personOf = (conf: WidgetConf, k: 'a' | 'b') =>
  ({ ...(k === 'a' ? DEFAULT_A : DEFAULT_B), ...(conf.settings[k] as Partial<WavePerson> | undefined) });
const syncOf = (conf: WidgetConf) => {
  const n = Number(conf.settings.sync ?? 87);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 87;
};
/** 매번 랜덤 (사용자 요청 — 기본 켜짐) · 랜덤 범위 */
const randomOf = (conf: WidgetConf) => conf.settings.random !== false;
const rangeOf = (conf: WidgetConf): [number, number] => {
  const clamp = (v: unknown, d: number) => { const n = Number(v ?? d); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d; };
  const lo = clamp(conf.settings.min, 10), hi = clamp(conf.settings.max, 99);
  return lo <= hi ? [lo, hi] : [hi, lo];
};

/** 일치율 → 상태 이름·색 */
function stateOf(sync: number) {
  if (sync < 40) return { label: '불안정', col: '#ff8a80', start: '#ff8a80', end: '#ff8a80' };
  if (sync < 80) return { label: '가이딩 중', col: '#e8d36a', start: '#e8d36a', end: '#7fd6e0' };
  if (sync < 95) return { label: '동조 중', col: '#7fd6e0', start: '#ff8a80', end: '#7fd6e0' };
  return { label: '완전 동조', col: '#bff3f7', start: '#d9f6f9', end: '#bff3f7' };
}

function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/** 사진 주소 — 사이트에 든 기본 그림(/…)은 그대로, 올린 사진은 저장소에서 */
function usePic(img?: string) {
  const fixed = img?.startsWith('/') ? img : undefined;
  const blob = useBlobUrl(fixed ? undefined : img);
  return fixed ?? blob;
}

const W = 330, H = 110, CY = 55, AMP = 24;

/** 두 파장 그리기 — 왼쪽은 센티넬의 흔들림, 오른쪽으로 갈수록 가이드 파장에 겹쳐 잔잔해진다 */
function Waves({ sync, id }: { sync: number; id: string }) {
  const sRef = useRef<SVGPathElement>(null);
  const gRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const s = sync / 100;
  const st = stateOf(sync);

  useEffect(() => {
    // 흔들림 크기 — 일치율이 높을수록 작고, 더 왼쪽에서 가이드 파장에 붙는다
    const p = Math.min(1, 0.15 + (1 - s) * 3.5);          // 이 지점(0~1)까지 오면 거의 겹친다
    const a0 = Math.min(1, 0.6 + (1 - s) * 1.2);          // 왼쪽 끝 흔들림
    const rest = (1 - s) * 0.5;                           // 끝까지 남는 잔흔들림
    // 센티넬 파장도 가이드처럼 둥근 곡선 — 다만 더 빠르고 높게 출렁이다가 오른쪽으로 갈수록 가이드 파장에 겹친다 (사용자 요청)
    const draw = (ph: number) => {
      let ds = '', dg = '';
      for (let x = 0; x <= W; x += 3) {
        const t = x / W;
        const sine = Math.sin(x / 16 + ph) * AMP * 0.8;
        dg += `${x ? 'L' : 'M'}${x},${(CY + sine).toFixed(1)}`;
        // m: 이 자리에서 센티넬이 얼마나 「자기 파동」인지 (1이면 제멋대로, 0이면 가이드 파장과 같음)
        const m0 = Math.min(1, a0 * Math.max(0, 1 - t / p) + rest);
        const m = m0 * m0 * (3 - 2 * m0);
        const own = Math.sin(x / 8.5 + ph * 1.7) * AMP * 1.05 + Math.sin(x / 27 - ph * 0.8) * AMP * 0.35;
        ds += `${x ? 'L' : 'M'}${x},${(CY + sine * (1 - m) + own * m).toFixed(1)}`;
      }
      sRef.current?.setAttribute('d', ds);
      gRef.current?.setAttribute('d', dg);
      glowRef.current?.setAttribute('d', dg);
    };
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) { draw(0); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => { draw((now - t0) / 1000 * 1.1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const gid = `gw-g-${id}`, fid = `gw-f-${id}`;
  return (
    <svg className="gw-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0" stopColor={st.start} />
          {sync >= 80 && sync < 95 && <stop offset=".55" stopColor="#e8b6c8" />}
          <stop offset="1" stopColor={st.end} />
        </linearGradient>
        <filter id={fid} x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      {[22, 44, 66, 88].map(y => <path key={y} d={`M0,${y}H${W}`} stroke="rgba(127,214,224,.07)" vectorEffect="non-scaling-stroke" />)}
      <path ref={glowRef} fill="none" stroke="#7fd6e0" strokeWidth={sync >= 95 ? 8 : 6} opacity={sync >= 95 ? 0.45 : 0.22} filter={`url(#${fid})`} />
      <path ref={gRef} fill="none" stroke="#7fd6e0" strokeWidth="2" opacity={sync < 40 ? 0.45 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path ref={sRef} fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Face({ img }: { img?: string }) {
  const src = usePic(img);
  return (
    <span className="gw-av">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </span>
  );
}

export function GuideWaveWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));
  const a = personOf(conf, 'a'), b = personOf(conf, 'b');
  // 랜덤이면 들어올 때마다 한 번 뽑는다 — 뽑기는 화면에 뜬 뒤에 (서버 렌더와 어긋나지 않게)
  const random = randomOf(conf);
  const [lo, hi] = rangeOf(conf);
  const [rolled, setRolled] = useState<number | null>(null);
  useEffect(() => {
    if (random) setRolled(lo + Math.floor(Math.random() * (hi - lo + 1)));
  }, [random, lo, hi]);
  const sync = random ? (rolled ?? Math.round((lo + hi) / 2)) : syncOf(conf);
  const st = stateOf(sync);
  // 센티넬을 먼저(빨간 선), 가이드를 다음(청록 선)으로 보여 준다
  const [sen, gui] = a.role === 'guide' && b.role === 'sentinel' ? [b, a] : [a, b];
  const note = String(conf.settings.note ?? '');

  return (
    <div className="panel widget gw-widget">
      <h4>
        GUIDING WAVE
        <span className="gw-right">
          <span className="gw-pill" style={{ color: st.col, background: `color-mix(in srgb, ${st.col} 15%, transparent)` }}>{st.label}</span>
          {isAdmin && <span className="more" onClick={e => { e.stopPropagation(); if (!editOn) setOpen(true); }}>설정 ›</span>}
        </span>
      </h4>
      <Waves sync={sync} id={conf.id} />
      <div className="gw-foot">
        <span className="gw-avs"><Face img={sen.img} /><Face img={gui.img} /></span>
        <span className="gw-lg">
          <span><i style={{ background: st.start }} />{sen.name} ({ROLE_LABEL[sen.role]})</span>
          <span><i style={{ background: '#7fd6e0' }} />{gui.name} ({ROLE_LABEL[gui.role]})</span>
        </span>
        <span className="gw-num">
          <b style={{ color: st.col }}>{sync}<small>%</small></b>
          <small>파장 일치율</small>
        </span>
      </div>
      {note && <div className="gw-note">{note}</div>}
      <Modal open={open} onClose={() => setOpen(false)} title="가이딩 파장"
        desc="일치율은 매번 랜덤으로 뽑거나 고정할 수 있어요. 일치율만 바꾸면 파장 모양·색·상태가 알아서 바뀌어요 (40% 아래 불안정 · 80% 아래 가이딩 중 · 95% 아래 동조 중 · 그 위 완전 동조)"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <GuideWaveEditor conf={conf} />}
      </Modal>
    </div>
  );
}

/** 사람 한 줄 — 사진(누르면 바꾸기) · 이름 · 센티넬/가이드 */
function PersonRow({ p, patch }: { p: WavePerson; patch: (x: Partial<WavePerson>) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = usePic(p.img);
  const [busy, setBusy] = useState(false);
  return (
    <div className="qt-char-row">
      <button type="button" className="qt-pic" title="사진 바꾸기" onClick={() => { if (!busy) fileRef.current?.click(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span>{busy ? '…' : '＋'}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { patch({ img: await putBlob(f) }); } catch (err) { toast(`사진을 올리지 못했습니다 — ${err instanceof Error ? err.message : String(err)}`); }
          setBusy(false);
        }} />
      <KInput value={p.name} placeholder="이름" style={{ flex: 1 }} onChange={e => patch({ name: e.target.value })} />
      <KSelect minWidth={110} value={p.role} onChange={v => patch({ role: v as Role })}
        options={[{ value: 'sentinel', label: '센티넬' }, { value: 'guide', label: '가이드' }]} />
    </div>
  );
}

export function GuideWaveEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const set = (p: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const a = personOf(conf, 'a'), b = personOf(conf, 'b');
  const sync = syncOf(conf);
  const random = randomOf(conf);
  const [lo, hi] = rangeOf(conf);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="cp-lb">파장 일치율</span>
        <KToggle label="매번 랜덤" checked={random} onChange={v => set({ random: v })} />
      </div>
      {random ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 14px', flexWrap: 'wrap' }}>
          <KInput type="number" min={0} max={100} value={lo} style={{ width: 70 }} onChange={e => set({ min: Number(e.target.value) })} />
          <span>~</span>
          <KInput type="number" min={0} max={100} value={hi} style={{ width: 70 }} onChange={e => set({ max: Number(e.target.value) })} />
          <span className="hint">% 사이에서 들어올 때마다 랜덤</span>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0 14px' }}>
        <input type="range" min={0} max={100} value={sync} style={{ flex: 1, accentColor: stateOf(sync).col }}
          onChange={e => set({ sync: Number(e.target.value) })} />
        <KInput type="number" min={0} max={100} value={sync} style={{ width: 70 }}
          onChange={e => set({ sync: Number(e.target.value) })} />
        <span className="hint" style={{ minWidth: 56 }}>{stateOf(sync).label}</span>
      </div>
      )}
      <span className="cp-lb">두 사람</span>
      <div className="qt-chars">
        <PersonRow p={a} patch={x => set({ a: { ...a, ...x } })} />
        <PersonRow p={b} patch={x => set({ b: { ...b, ...x } })} />
      </div>
      <span className="cp-lb" style={{ display: 'block', marginTop: 14 }}>한 줄 메모 (비워 두면 안 보임)</span>
      <KInput value={String(conf.settings.note ?? '')} placeholder="예: “귀가 너무 시끄러워.” — 존 직전" style={{ width: '100%', marginTop: 6 }}
        onChange={e => set({ note: e.target.value })} />
    </div>
  );
}
