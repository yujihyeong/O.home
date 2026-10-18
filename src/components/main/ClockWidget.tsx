'use client';
// 시계 위젯 (사용자 요청) — 지금 시간. 배경을 끄고 투명하게 쓰는 걸 기본으로 생각하고 만들었다:
// 글씨·바늘 색은 위젯 글씨색(배경 없으면 홈 배경 밝기에 맞춰 자동)을 따르고, 테두리·판 없이 숫자만 크게.
//  · 모양: 디지털(큰 숫자) / 아날로그(바늘 시계)
//  · 12시간·24시간, 초 표시, 날짜 표시는 설정에서
import React, { useEffect, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { KSelect, KToggle } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function useNow(withSeconds: boolean) {
  const [now, setNow] = useState<Date | null>(null);   // 서버 렌더 땐 비워 둔다 (시간이 어긋나지 않게)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      // 초를 안 보이면 다음 분에 맞춰 한 번만 깨어난다
      t = setTimeout(tick, withSeconds ? 1000 - d.getMilliseconds() : 60000 - d.getSeconds() * 1000 - d.getMilliseconds());
    };
    tick();
    return () => clearTimeout(t);
  }, [withSeconds]);
  return now;
}

const optsOf = (conf: WidgetConf) => ({
  style: (conf.settings.style as string) === 'analog' ? 'analog' : 'digital',
  h12: conf.settings.h12 === true,
  sec: conf.settings.sec === true,
  date: conf.settings.date !== false,
});

/** 편집 모드의 ✎(설정) 버튼 */
function useEditOpen(id: string) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id]);
  return [open, setOpen] as const;
}

export function ClockWidget({ conf }: { conf: WidgetConf }) {
  const o = optsOf(conf);
  const [open, setOpen] = useEditOpen(conf.id);
  const modal = (
    <Modal open={open} onClose={() => setOpen(false)} small title="시계"
      actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
      {open && <ClockEditor conf={conf} />}
    </Modal>
  );
  const now = useNow(o.sec || o.style === 'analog');
  const dateLine = now ? `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}` : '';

  if (o.style === 'analog') {
    const h = now ? now.getHours() % 12 : 10, m = now ? now.getMinutes() : 10, s = now ? now.getSeconds() : 0;
    const hand = (deg: number, len: number, w: number, op = 1) => (
      <line x1="50" y1="50" x2={50 + len * Math.sin(deg * Math.PI / 180)} y2={50 - len * Math.cos(deg * Math.PI / 180)}
        stroke="currentColor" strokeWidth={w} strokeLinecap="round" opacity={op} />
    );
    return (
      <div className="panel widget ck-widget ck-analog">
        <svg viewBox="0 0 100 100" className="ck-face" aria-label={now ? now.toLocaleTimeString('ko-KR') : '시계'}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = i * 30 * Math.PI / 180, big = i % 3 === 0;
            return <line key={i} x1={50 + 44 * Math.sin(a)} y1={50 - 44 * Math.cos(a)} x2={50 + (big ? 37 : 40) * Math.sin(a)} y2={50 - (big ? 37 : 40) * Math.cos(a)}
              stroke="currentColor" strokeWidth={big ? 2.2 : 1.2} strokeLinecap="round" opacity={big ? 0.9 : 0.55} />;
          })}
          {hand(h * 30 + m * 0.5, 23, 3.4)}
          {hand(m * 6 + s * 0.1, 33, 2.2)}
          {o.sec && <line x1="50" y1="56" x2={50 + 38 * Math.sin(s * 6 * Math.PI / 180)} y2={50 - 38 * Math.cos(s * 6 * Math.PI / 180)}
            stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />}
          <circle cx="50" cy="50" r="2.6" fill="currentColor" />
        </svg>
        {o.date && <div className="ck-date">{dateLine}</div>}
        {modal}
      </div>
    );
  }

  const hh = now ? (o.h12 ? (now.getHours() % 12 || 12) : now.getHours()) : 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="panel widget ck-widget">
      <div className="ck-time" suppressHydrationWarning>
        {o.h12 && <span className="ck-ampm">{now && now.getHours() < 12 ? 'AM' : 'PM'}</span>}
        <span className="ck-hm">{now ? `${o.h12 ? hh : pad(hh)}:${pad(now.getMinutes())}` : '--:--'}</span>
        {o.sec && <span className="ck-sec">{now ? pad(now.getSeconds()) : '--'}</span>}
      </div>
      {o.date && <div className="ck-date">{dateLine}</div>}
      {modal}
    </div>
  );
}

export function ClockEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const o = optsOf(conf);
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="cp-lb">모양</span>
        <KSelect minWidth={140} value={o.style} onChange={v => set({ style: v })}
          options={[{ value: 'digital', label: '디지털 (숫자)' }, { value: 'analog', label: '아날로그 (바늘)' }]} />
      </div>
      {o.style === 'digital' && <KToggle label="12시간 (AM·PM)" checked={o.h12} onChange={v => set({ h12: v })} />}
      <KToggle label="초 표시" checked={o.sec} onChange={v => set({ sec: v })} />
      <KToggle label="날짜 표시" checked={o.date} onChange={v => set({ date: v })} />
      <p className="hint" style={{ margin: 0 }}>배경을 끄면(위젯 「배경」 끄기) 홈 배경 밝기에 맞춰 글씨색이 알아서 바뀌어요</p>
    </div>
  );
}
