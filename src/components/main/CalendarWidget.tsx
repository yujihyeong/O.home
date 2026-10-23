'use client';
// 캘린더 위젯 (사용자 요청) — 이번 달 달력. 스케줄러 일정이 날짜 아래 점으로 찍히고, 날짜를 누르면 그날 일정이 아래에 뜬다.
// 글씨는 나눔명조 + 기본 글씨체만 (영문 필기체 금지 — 사용자 요청)
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSched, eventColor, eventOnDate } from '@/lib/schedStore';
import { useMenuSettings, canViewHref } from '@/lib/menuStore';
import { sectionHref, MAIN_SEC, useSections } from '@/lib/sectionStore';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function CalendarWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { st } = useSched();
  const [menuSet] = useMenuSettings();
  const { list } = useSections();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const seeSec = (secId?: string) => canViewHref(menuSet, sectionHref('sched', secId ?? MAIN_SEC), viewer);

  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [pick, setPick] = useState<string | null>(null);

  // 볼 수 있는 일정만 (비공개 스케줄러·공개 범위)
  const events = useMemo(() => st.events
    .filter(e => seeSec(e.secId))
    .filter(e => isAdmin || e.visibility === 'public' || (e.visibility === 'member' && !!user)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [st.events, menuSet, isAdmin, user]);

  const first = new Date(cur.y, cur.m, 1).getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const go = (d: number) => {
    setPick(null);
    setCur(c => { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  };
  const picked = pick ? events.filter(e => eventOnDate(e, pick)) : [];
  const hasSched = list('sched').some(s => seeSec(s.id));

  return (
    <div className="panel widget cw-widget">
      <div className="cw-head">
        <button type="button" aria-label="이전 달" onClick={() => go(-1)}>‹</button>
        <button type="button" className="cw-title" onClick={() => { setCur({ y: now.getFullYear(), m: now.getMonth() }); setPick(null); }}
          data-tip="오늘로">
          <b>{pad(cur.m + 1)}</b><span>{MONTHS[cur.m]} {cur.y}</span>
        </button>
        <button type="button" aria-label="다음 달" onClick={() => go(1)}>›</button>
      </div>
      <div className="cw-grid">
        {WEEK.map((w, i) => <span key={`w${i}`} className={`cw-w ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={i} className="cw-d empty" />;
          const date = ymd(cur.y, cur.m, d);
          const evs = events.filter(e => eventOnDate(e, date));
          const dow = i % 7;
          return (
            <button type="button" key={i}
              className={`cw-d ${date === todayStr ? 'today' : ''} ${date === pick ? 'on' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`}
              onClick={() => setPick(p => (p === date ? null : date))}>
              <span className="n">{d}</span>
              <span className="dots">
                {evs.slice(0, 3).map(e => <i key={e.id} style={{ background: eventColor(e, st.cats) }} />)}
              </span>
            </button>
          );
        })}
      </div>
      {pick && (
        <div className="cw-list">
          <div className="cw-list-h">{Number(pick.slice(5, 7))}월 {Number(pick.slice(8))}일</div>
          {picked.length
            ? picked.map(e => (
              <div key={e.id} className="cw-ev" onClick={() => hasSched && router.push('/cal')}>
                <i style={{ background: eventColor(e, st.cats) }} />{e.title}
              </div>
            ))
            : <div className="cw-none">일정이 없어요</div>}
        </div>
      )}
    </div>
  );
}
