'use client';
// 모스부호 위젯 (사용자 요청) — 관리자가 적은 문장을 모스부호로 바꿔 한 기호씩 실제 리듬(점 1 · 선 3)으로 빛낸다.
// 낮에는 꽃잎이 흩날리고, 밤에는 별이 반짝이며 흘러간다 (낮/밤 색은 CSS — html[data-scene]).
// 글씨는 나눔명조 + 기본 글씨체만 (영문 필기체 금지 — 사용자 요청)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { KCheck } from '@/components/ui/Kit';
import { toMorse } from '@/lib/morse';

const UNIT = 170;                // 점 하나의 길이(ms)
const textOf = (conf: WidgetConf) => (typeof conf.settings.text === 'string' ? conf.settings.text : 'SPRING');
const pad = (n: number) => String(n).padStart(2, '0');

/** 꾸밈 — 위치는 고정된 난수로 (그릴 때마다 같은 자리) */
function Deco() {
  const { stars, petals } = useMemo(() => {
    let r = 7;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const st = Array.from({ length: 30 }, () => ({ x: rnd() * 100, y: rnd() * 100, big: rnd() < 0.18, d: -rnd() * 3 }));
    const pt = Array.from({ length: 14 }, () => ({ x: 10 + rnd() * 95, d: -rnd() * 11, t: 8 + rnd() * 6, s: rnd() < 0.4 }));
    return { stars: st, petals: pt };
  }, []);
  // 별은 두 벌을 나란히 두고 왼쪽으로 천천히 흘려 끊김 없이 이어지게
  const layer = stars.map((s, i) => (
    <i key={i} className={`mw-star ${s.big ? 'b' : ''}`} style={{ left: `${s.x / 2}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }} />
  ));
  return (
    <div className="mw-deco" aria-hidden>
      <div className="mw-sky">
        {layer}
        {stars.map((s, i) => (
          <i key={`b${i}`} className={`mw-star ${s.big ? 'b' : ''}`} style={{ left: `${50 + s.x / 2}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      <i className="mw-shoot" />
      <i className="mw-moon" />
      {petals.map((p, i) => (
        <i key={i} className={`mw-petal ${p.s ? 's' : ''}`} style={{ left: `${p.x}%`, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }} />
      ))}
    </div>
  );
}

export function MorseWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === conf.id) setOpen(true); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [conf.id]);

  const text = textOf(conf);
  const units = useMemo(() => toMorse(text), [text]);
  const letters = units.filter(u => !('space' in u)).length;
  const [reveal, setReveal] = useState(conf.settings.reveal === true);
  useEffect(() => { setReveal(conf.settings.reveal === true); }, [conf.settings.reveal]);

  // 지금 보내는 자리 — u: 몇 번째 단위, b: 그 안의 몇 번째 기호, on: 켜져 있는가
  const [pos, setPos] = useState({ u: -1, b: -1, on: false });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const steps: { u: number; b: number; on: boolean; ms: number }[] = [];
    units.forEach((un, u) => {
      if ('space' in un) { steps.push({ u, b: -1, on: false, ms: UNIT * 4 }); return; }
      [...un.code].forEach((c, b) => {
        steps.push({ u, b, on: true, ms: UNIT * (c === '-' ? 3 : 1) });
        steps.push({ u, b: b + 1, on: false, ms: UNIT * (b === un.code.length - 1 ? 3 : 1) });
      });
    });
    if (!steps.length) return;
    let i = 0;
    const tick = () => {
      if (i >= steps.length) {               // 한 바퀴 끝 — 잠깐 쉬었다 처음부터
        setPos({ u: units.length, b: -1, on: false });
        i = 0;
        timer.current = window.setTimeout(tick, 2600);
        return;
      }
      const s = steps[i++];
      setPos({ u: s.u, b: s.b, on: s.on });
      timer.current = window.setTimeout(tick, s.ms);
    };
    timer.current = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer.current);
  }, [units]);

  // 몇 번째 글자를 보내는 중인지 (띄어쓰기는 세지 않는다)
  const curLetter = Math.min(letters, units.slice(0, Math.max(0, pos.u) + 1).filter(u => !('space' in u)).length);

  return (
    <div className="panel widget mw-widget">
      <Deco />
      <div className="mw-hd">
        <span>MORSE</span>
        <span className="mw-count">{pad(pos.u < 0 ? 0 : curLetter)} / {pad(letters)}</span>
      </div>
      <div className="mw-code">
        {units.length ? units.map((un, u) => ('space' in un
          ? <i key={u} className="mw-sp" />
          : (
            <span key={u} className={`mw-ch ${u === pos.u ? 'cur' : ''}`}>
              <span className="mw-bits">
                {[...un.code].map((c, b) => {
                  const done = u < pos.u || (u === pos.u && b < pos.b);
                  const now = u === pos.u && b === pos.b && pos.on;
                  return <i key={b} className={`${c === '-' ? 's' : 'd'} ${now ? 'now' : done ? 'done' : ''}`} />;
                })}
              </span>
              <b>{reveal ? un.ch : ''}</b>
            </span>
          )))
          : <span className="mw-empty">{isAdmin ? '⚙ 눌러 문장을 적어 주세요' : ''}</span>}
      </div>
      <div className="mw-ft">
        <span className={`mw-msg ${reveal ? '' : 'hid'}`}>
          {reveal ? text : Array.from({ length: letters }, () => '·').join(' ')}
        </span>
        <button type="button" onClick={() => setReveal(v => !v)}>{reveal ? '원문 숨기기' : '원문 보기'}</button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="모스부호"
        desc="문장을 적으면 모스부호로 바뀌어 한 기호씩 빛나요 — 한글·영문·숫자"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <MorseEditor conf={conf} />}
      </Modal>
    </div>
  );
}

export function MorseEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const set = (p: Record<string, unknown>) => updateWidget(conf.id, { settings: { ...conf.settings, ...p } }, { persist: true });
  const text = textOf(conf);
  const units = toMorse(text);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <input className="k-input" value={text} maxLength={40} placeholder="예: 봄이 오면"
        onChange={e => set({ text: e.target.value })} />
      <p style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.7, margin: 0, wordBreak: 'break-all' }}>
        {units.map(u => ('space' in u ? ' / ' : `${u.ch} ${u.code.replace(/\./g, '·').replace(/-/g, '−')}  `))}
      </p>
      <KCheck label="처음부터 원문 보여 주기 (끄면 방문자가 「원문 보기」를 눌러야 보여요)"
        checked={conf.settings.reveal === true} onChange={v => set({ reveal: v })} />
    </div>
  );
}
