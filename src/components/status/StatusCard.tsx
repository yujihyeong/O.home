'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// 상태창 카드 (사용자 요청) — 글 속 <JISUNWOO scene='{…}' npc='{…}' … /> 를 이 카드로 그린다.
// 사용자가 준 JSX 상태창을 그대로 옮긴 것: 각 칸(scene·npc·pc·life·heart·plans·records)의 JSON을 느슨하게 읽어 항목별로 채운다.
import React, { useEffect, useState } from 'react';

export type StatusCardProps = Partial<Record<'scene' | 'npc' | 'pc' | 'life' | 'heart' | 'plans' | 'records', string>>;

const GROUP_KEYS: Record<string, string[]> = {
  scene: ['턴', '날짜', '시간', '날씨', '위치M', '위치S', '긴장도', '행복도', 'nowPlaying'],
  npc: ['C본명', 'C나이', 'C성별', 'C직업', 'C복장', 'C자세', 'C소지품', 'C식사', 'C청결'],
  pc: ['U본명', 'U나이', 'U성별', 'U직업', 'U복장', 'U자세', 'U소지품', 'U식사', 'U청결'],
  life: ['스킨십', '벌금', '샤샤사료', '샤샤건강', '샤샤속마음'],
  heart: ['심중', 'TMI', 'QNA'],
  plans: ['약속', '일정'],
  records: ['MD', 'LD', '키스', 'NSFW'],
};

/** 느슨한 JSON 읽기 — HTML 엔티티, 한 번 더 이스케이프된 따옴표, 날 줄바꿈·역슬래시를 차례로 고쳐 본다 */
function parseLoose(raw: string): any {
  const entities: Record<string, string> = { quot: '"', '#34': '"', '#x22': '"', amp: '&', '#38': '&', lt: '<', gt: '>', apos: "'", '#39': "'", '#x27': "'" };
  const decoded = raw.replace(/&(quot|#34|#x22|amp|#38|lt|gt|apos|#39|#x27);/gi, (_m, e: string) => entities[e.toLowerCase()]);
  const unescapeOnce = (t: string) => t.replace(/\\(["\\/])/g, '$1');
  const fixBackslash = (t: string) => t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  const fixNewline = (t: string) => {
    let inStr = false, esc = false, res = '';
    for (const ch of t) {
      if (inStr && !esc && (ch === '\n' || ch === '\r' || ch === '\t')) { if (ch !== '\r') res += ch === '\n' ? '\\n' : '\\t'; continue; }
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = !inStr;
      res += ch;
    }
    return res;
  };
  const candidates: string[] = [];
  [raw, decoded].forEach(base => {
    [base, unescapeOnce(base)].forEach(t => candidates.push(t, fixBackslash(t), fixNewline(t), fixBackslash(fixNewline(t))));
  });
  for (const c of candidates) {
    try {
      let r = JSON.parse(c);
      if (typeof r === 'string') r = JSON.parse(r);
      return r;
    } catch { /* 다음 후보 */ }
  }
  throw new Error('invalid');
}

export function StatusCard(props: StatusCardProps) {
  const values: Record<string, any> = {};
  const invalidGroups: string[] = [];
  const parsedGroups: any[] = [];
  Object.keys(GROUP_KEYS).forEach(group => {
    try {
      const input = (props as Record<string, string | undefined>)[group] ?? '{}';
      const parsed = parseLoose(input.trim() || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { invalidGroups.push(group); return; }
      parsedGroups.push(parsed);
      GROUP_KEYS[group].forEach(key => { if (Object.prototype.hasOwnProperty.call(parsed, key)) values[key] = parsed[key]; });
    } catch {
      invalidGroups.push(group);
    }
  });
  // 다른 칸에 잘못 넣은 항목도 찾아 채운다
  Object.values(GROUP_KEYS).flat().forEach(key => {
    if (Object.prototype.hasOwnProperty.call(values, key)) return;
    const found = parsedGroups.find(p => Object.prototype.hasOwnProperty.call(p, key));
    if (found) values[key] = found[key];
  });
  const s: Record<string, string> = Object.fromEntries(
    Object.values(GROUP_KEYS).flat().filter(k => k !== 'nowPlaying').map(k => {
      const v = values[k];
      return [k, typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''];
    }),
  );

  const [tab, setTab] = useState<string | null>(null);
  const [term, setTerm] = useState<string | null>(null);

  const safeString = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const name = (p: string) => s[p + '본명'];
  const lines = (v: string) =>
    String(v || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const chipsOf = (v: string) => lines(v).flatMap(l => l.split(/\s*[,，、]\s*/)).filter(Boolean);

  const dayNum = (v: string) => {
    const m = String(v || '').match(/(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (!m) return null;
    const y = Number(m[1]) < 100 ? 2000 + Number(m[1]) : Number(m[1]);
    return Math.round(Date.UTC(y, Number(m[2]) - 1, Number(m[3])) / 864e5);
  };
  const today = dayNum(s.날짜);
  const dday = (raw: string) => {
    if (!raw) return { big: '', sub: '' };
    if (/^\d+$/.test(raw)) return { big: 'D+' + raw, sub: '' };
    const d = dayNum(raw);
    if (d != null && today != null) {
      const diff = today - d;
      return { big: diff >= 0 ? 'D+' + (diff + 1) : 'D' + diff, sub: raw };
    }
    return { big: raw, sub: '' };
  };

  const mark = (v: string) => {
    const t = safeString(v);
    if (!t) return { state: '', detail: '' };
    const done = /^(o|✓|✔|☑|완료|했|먹었|씻었)/i.test(t);
    const not = /^(x|✕|✗|아직|안|못)/i.test(t);
    const detail = t.replace(/^(o|x|✓|✔|☑|✕|✗)\s*/i, '').trim();
    return { state: done ? 'done' : not ? 'not' : '', detail };
  };

  const statusOf = (line: string): [string, string] => {
    const m = line.match(/^(.*?)\s*[(\[（]\s*(진행\s*중|진행|예정|완료|달성|취소|보류)\s*[)\]）]\s*$/);
    if (!m) return [line, ''];
    const w = m[2].replace(/\s+/g, '');
    return [m[1], /완료|달성/.test(w) ? '완료' : /취소|보류/.test(w) ? w : w === '예정' ? '예정' : '진행 중'];
  };
  const splitWho = (line: string): [string, string] => {
    const m = line.match(/^\s*([^\d:：|]{1,10}?)\s*[:：|]\s*(.+)$/);
    return m ? [m[1].trim(), m[2].trim()] : ['', line];
  };

  const gaugeOf = (v: string) => Math.max(0, Math.min(100, Number(String(v).replace(/[^\d.]/g, '')) || 0));
  const tension = gaugeOf(s.긴장도);
  const happy = gaugeOf(s.행복도);
  const gauge = (label: string, val: number, kind: string) => (
    <span className={'gp-gauge is-' + kind + (kind === 'tense' && val > 50 ? ' is-alert' : '')} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={val}>
      <small>{label}</small>
      <span className="gp-gauge-bar"><i style={{ width: val + '%', '--t': Math.max(val, 1), '--sp': (2.4 - val * 0.018).toFixed(2) + 's' } as React.CSSProperties} /></span>
    </span>
  );
  const qna: [string, string][] = [];
  lines(s.QNA).forEach(line => {
    const q = line.match(/^Q\s*[.:：)]?\s*(.+)$/i);
    const ans = line.match(/^A\s*[.:：)]?\s*(.+)$/i);
    if (q) qna.push([q[1].trim(), '']);
    else if (ans && qna.length && !qna[qna.length - 1][1]) qna[qna.length - 1][1] = ans[1].trim();
    else if (line.includes('|')) {
      const cut = line.indexOf('|');
      qna.push([line.slice(0, cut).trim(), line.slice(cut + 1).trim()]);
    } else qna.push([line, '']);
  });
  const mind = s.심중;
  const mindChars = Array.from(mind);
  const [typed, setTyped] = useState(0);
  const [erasing, setErasing] = useState(false);
  useEffect(() => { setTyped(0); setErasing(false); }, [mind]);
  useEffect(() => {
    if (tab !== 'secret' || !mindChars.length) return undefined;
    const len = mindChars.length;
    let delay = erasing ? 35 : 80;
    if (!erasing && typed >= len) delay = 2800;
    if (erasing && typed <= 0) delay = 900;
    const timer = setTimeout(() => {
      if (!erasing) {
        if (typed >= len) setErasing(true);
        else setTyped(typed + 1);
      } else if (typed <= 0) setErasing(false);
      else setTyped(typed - 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [tab, mind, typed, erasing, mindChars.length]);
  const turn = s.턴 ? String(s.턴).padStart(2, '0') : '';

  const sec = (id: string, no: string, title: string, en: string, tone: string, body: React.ReactNode) =>
    tab !== id ? null : (
      <section key={id} className={'gp-st gp-sec gp-panel is-' + tone}>
        <div className="gp-in">
          <div className="gp-sec-head">
            <span className="gp-no">{no}</span>
            <span className="gp-sec-title"><small>{en}</small><b>{title}</b></span>
            <button type="button" className="gp-close" aria-label={title + ' 닫기'} onClick={() => setTab(null)}>×</button>
          </div>
          <div className="gp-sec-body">{body}</div>
        </div>
      </section>
    );

  const stamps = [
    { id: 'people', label: '두 사람', en: 'WHO', art: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19.5c0-3 2.2-5 5-5s5 2 5 5M11 19.5c0-3 2.2-5 5-5s5 2 5 5' },
    { id: 'daily', label: '일상', en: 'TODAY', art: 'M5 9.5h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9.5ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c0 1.5 1 1.5 1 3M12 3.5c0 1.5 1 1.5 1 3' },
    { id: 'secret', label: '비밀', en: 'SECRET', art: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13zM12 14v2.5' },
    { id: 'plan', label: '약속·일정', en: 'PLAN', art: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7' },
    { id: 'record', label: '기록', en: 'RECORD', art: 'M19.5 5.6a4.8 4.8 0 0 0-6.8 0L12 6.4l-.7-.8a4.8 4.8 0 0 0-6.8 6.8L12 19.8l7.5-7.4a4.8 4.8 0 0 0 0-6.8Z' },
  ];

  const ageText = (p: string) => {
    const a = s[p + '나이'];
    return a ? (/^\d+$/.test(a) ? a + '세' : a) : '';
  };

  const fineLines = lines(s.벌금);
  const fineTotalLine = fineLines.find(l => /^(총합|합계|총액)/.test(l)) || '';
  const fineTotal = fineTotalLine.replace(/^(총합|합계|총액)\s*[:：·]?\s*/, '');
  const fines = fineLines.filter(l => l !== fineTotalLine).slice(-3);
  const promises = lines(s.약속);
  const promiseMap = new Map<string, [string, string][]>([['함께', []]]);
  promises.forEach(line => {
    const [body, state] = statusOf(line);
    const [who, what] = splitWho(body);
    const key = who || '함께';
    if (!promiseMap.has(key)) promiseMap.set(key, []);
    promiseMap.get(key)!.push([what, state]);
  });
  const isPcName = (who: string) => /열망/.test(who) || (s.U본명 !== '' && (who === s.U본명 || s.U본명.endsWith(who)));
  const promiseGroups = [...promiseMap].filter(([, items]) => items.length);
  const planBuckets: Record<string, [string, string][]> = { 단기: [], 중기: [], 장기: [], 미분류: [] };
  let planTerm = '미분류';
  lines(s.일정).forEach(line => {
    const m = line.match(/^(?:\[(단기|중기|장기)\]|(단기|중기|장기)\s*[:：|])\s*(.*)$/);
    let rest = line;
    if (m) { planTerm = m[1] || m[2]; rest = m[3].trim(); }
    if (!rest) return;
    const cut = rest.match(/^(.{1,14}?)\s*[·|]\s*(.+)$/);
    planBuckets[planTerm].push(cut ? [cut[1].trim(), cut[2].trim()] : ['', rest]);
  });
  const terms = ['단기', '중기', '장기', ...(planBuckets.미분류.length ? ['미분류'] : [])];
  const currentTerm = term || terms.find(t => planBuckets[t].length) || '단기';

  const met = dday(s.MD);
  const love = dday(s.LD);

  const musicInput = values.nowPlaying && typeof values.nowPlaying === 'object' ? values.nowPlaying : {};
  const song = {
    title: safeString(musicInput.곡명 || musicInput.title),
    artist: safeString(musicInput.가수 || musicInput.artist),
    line: safeString(musicInput.가사 || musicInput.한줄 || musicInput.line),
    trans: safeString(musicInput.번역 || musicInput.translation),
  };
  const catFood = mark(s.샤샤사료);
  const songSeed = Array.from(song.title + song.artist).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const total = 170 + (songSeed % 90);
  const [playing, setPlaying] = useState(true);
  const [liked, setLiked] = useState(false);
  const [elapsed, setElapsed] = useState(() => (song.title ? Math.round(total * (0.18 + (songSeed % 40) / 100)) : 0));
  useEffect(() => {
    if (!playing || !song.title) return undefined;
    const t = setInterval(() => setElapsed(v => (v + 1 >= total ? 0 : v + 1)), 1000);
    return () => clearInterval(t);
  }, [playing, total, song.title]);
  const lyric = song.line;
  const clock = (n: number) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');

  return (
    <div className="gp">
      <style>{CSS}</style>
      {invalidGroups.length > 0 && <div className="gp-err">입력 형식을 확인해 주세요: {invalidGroups.join(', ')} (JSON 객체 문자열)</div>}

      <header className="gp-st gp-head">
        <div className="gp-in">
          <div className="gp-head-top">
            <div className="gp-denom">
              <div>
                <small>TURN</small>
                <br />
                <b>{turn}</b>
              </div>
            </div>
            <div className="gp-title">
              <small>{[s.날짜, s.시간].filter(Boolean).join(' · ')}</small>
              <strong>오빠에게</strong>
              <em>지선우 ✉ 춘열망</em>
            </div>
            <svg className="gp-postmark" viewBox="0 0 120 70" aria-label="은방울꽃 소인">
              <defs>
                <filter id="gpInk" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={4} result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale={0.7} result="d" />
                  <feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves={1} seed={9} result="m" />
                  <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.1" result="mask" />
                  <feComposite in="d" in2="mask" operator="in" />
                </filter>
              </defs>
              <g filter="url(#gpInk)">
                <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M2 24q6-4 12 0t12 0t12 0t12 0" />
                  <path d="M2 35q6-4 12 0t12 0t12 0t12 0" />
                  <path d="M2 46q6-4 12 0t12 0t12 0t12 0" />
                  <circle cx="88" cy="35" r="28" strokeWidth="1.6" />
                  <circle cx="88" cy="35" r="23.5" strokeDasharray="2 2.6" />
                </g>
                <g transform="translate(89.5 36) scale(.76) translate(-55 -58)" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M44 74C30 67 27 49 33 36C41 47 45 60 44 74Z" />
                  <path d="M43 71C38 61 35 50 33.5 39" strokeWidth="1.2" />
                  <path d="M44 74C43 52 52 36 75 44" />
                  <path d="M50.5 47.8Q52.5 50.2 51.5 55.4M57.1 43.1Q59.1 45.6 58.1 50.7M65.6 42.0Q67.6 44.5 66.6 49.1M75.0 44.0Q77.0 46.5 76.0 49.6" strokeWidth="1.3" />
                  <path d="M47.5 59.8C47.5 55.0 55.5 55.0 55.5 59.8L56.7 62.2L54.3 61.4L52.9 62.9L51.5 61.5L50.1 62.9L48.7 61.4L46.3 62.2ZM54.1 55.1C54.1 50.3 62.1 50.3 62.1 55.1L63.3 57.6L60.9 56.7L59.5 58.2L58.1 56.9L56.7 58.2L55.3 56.7L52.9 57.6ZM62.6 53.5C62.6 48.7 70.6 48.7 70.6 53.5L71.8 56.0L69.4 55.1L68.0 56.6L66.6 55.3L65.2 56.6L63.8 55.1L61.4 56.0ZM72.0 54.0C72.0 49.2 80.0 49.2 80.0 54.0L81.2 56.5L78.8 55.6L77.4 57.1L76.0 55.8L74.6 57.1L73.2 55.6L70.8 56.5Z" fill="none" strokeWidth="1.5" />
                </g>
              </g>
            </svg>
          </div>
          <div className="gp-meta">
            <span className="gp-chip is-lav gp-chip-sky" title="날씨">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="날씨"><path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18Z" /></svg>
              <span>{s.날씨}</span>
            </span>
            {gauge('긴장도', tension, 'tense')}
            <span className="gp-chip gp-chip-at" title="위치">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="위치"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.3" /></svg>
              <span>{[s.위치M, s.위치S].filter(Boolean).join(' ')}</span>
            </span>
            {gauge('행복도', happy, 'happy')}
          </div>
          <div className="gp-stamps" role="group" aria-label="항목 펼치기">
            {stamps.map(st => (
              <button key={st.id} type="button" className={'gp-stamp is-' + st.id + (tab === st.id ? ' is-on' : '')} aria-pressed={tab === st.id} onClick={() => setTab(t => (t === st.id ? null : st.id))}>
                <span className="gp-stamp-perf">
                  <span className="gp-stamp-face">
                    <small>{st.en}</small>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={st.art} /></svg>
                  </span>
                </span>
                <span className="gp-stamp-label">{st.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="gp-body">
        {sec('people', '01', '두 사람', 'WHO', 'leaf',
          <div className="gp-grid is-people">
            {['C', 'U'].map(p => (
              <div key={'h' + p} className={'gp-cell is-top is-' + p}>
                <div className="gp-person-head">
                  <span className="gp-tag">{p === 'C' ? 'NPC' : 'PC'}</span>
                  <b>{name(p)}</b>
                  <small>{[ageText(p), s[p + '성별'], s[p + '직업']].filter(Boolean).join(' · ')}</small>
                </div>
              </div>
            ))}
            {[['복장', '복장'], ['자세', '자세']].map(([label, key], row, all) =>
              ['C', 'U'].map(p => (
                <div key={key + p} className={'gp-cell is-' + p + (row === all.length - 1 ? ' is-bot' : '')}>
                  <div className="gp-row">
                    <span className="gp-row-label">{label}</span>
                    <p>{s[p + key]}</p>
                  </div>
                </div>
              )),
            )}
          </div>,
        )}

        {sec('daily', '02', '오늘의 일상', 'TODAY', 'lav',
          <>
            <div className="gp-grid is-daily">
              {['C', 'U'].map(p => (
                <div key={'n' + p} className={'gp-cell is-top is-' + p}>
                  <b className="gp-cell-name">{name(p)}</b>
                </div>
              ))}
              {['C', 'U'].map(p => {
                const bag = chipsOf(s[p + '소지품']);
                return (
                  <div key={'b' + p} className={'gp-cell is-' + p}>
                    <div className="gp-mini">소지품</div>
                    {bag.length > 0 && <div className="gp-bag">{bag.map((b, i) => <span key={i}>{b}</span>)}</div>}
                  </div>
                );
              })}
              {[['🍚', '식사'], ['🫧', '청결']].map(([ic, lb], row) =>
                ['C', 'U'].map(p => {
                  const m = mark(s[p + lb]);
                  return (
                    <div key={lb + p} className={'gp-cell is-' + p + (row === 1 ? ' is-bot' : '')}>
                      {row === 0 && <div className="gp-mini">식사 · 청결</div>}
                      <div className="gp-care-row">
                        <b>{ic} {lb}</b>
                        {m.state && <em className={'is-' + m.state}>{m.state === 'done' ? '했어요' : '아직'}</em>}
                        <span>{m.detail}</span>
                      </div>
                    </div>
                  );
                }),
              )}
            </div>
            <div className="gp-touch">
              <i aria-hidden="true">♡</i>
              <div>
                <small>오늘의 스킨십</small>
                {lines(s.스킨십).length > 0 && (
                  <ul className="gp-touch-list">
                    {lines(s.스킨십).map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <div className="gp-fine">
              <i aria-hidden="true">₩</i>
              <div>
                <div className="gp-fine-head"><small>벌금</small></div>
                {fines.length > 0 && (
                  <ul className="gp-touch-list">
                    {fines.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
                {fineTotal && (
                  <div className="gp-fine-total"><span>총합</span><b>{fineTotal}</b></div>
                )}
              </div>
            </div>
            <div className="gp-cat">
              <div className="gp-cat-head">
                <span className="gp-cat-stamp" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9.5V4l4 3.2a8.6 8.6 0 0 1 6 0L19 4v5.5a8 8 0 0 1 1 3.9C20 17.6 16.4 20 12 20s-8-2.4-8-6.6a8 8 0 0 1 1-3.9Z" /><path d="M9 12.5h.01M15 12.5h.01M11 15.2l1 .8 1-.8M3 14.5l3 .3M21 14.5l-3 .3" /></svg>
                </span>
                <div><small>OUR CAT</small><b>샤샤</b></div>
              </div>
              <div className="gp-care">
                <div className="gp-care-row">
                  <b>🐟 사료</b>
                  {catFood.state && <em className={'is-' + catFood.state}>{catFood.state === 'done' ? '먹었어요' : '아직'}</em>}
                  <span>{catFood.detail}</span>
                </div>
                <div className="gp-care-row"><b>🩺 건강</b><span>{s.샤샤건강}</span></div>
              </div>
              <p className="gp-cat-mind"><span>샤샤의 속마음</span>{s.샤샤속마음}</p>
            </div>
          </>,
        )}

        {sec('secret', '03', '비밀', 'SECRET', 'lav',
          <>
            <div className="gp-secret">
              <span className="gp-secret-label">심중</span>
              <p aria-label={mind}>
                <span aria-hidden="true">{mindChars.slice(0, typed).join('')}</span>
                {mind && <i className="gp-caret" aria-hidden="true" />}
              </p>
            </div>
            <div className="gp-tmi">
              <span className="gp-secret-label">TMI</span>
              <p>{s.TMI}</p>
            </div>
            <div className="gp-qna">
              <span className="gp-secret-label">Q&amp;A</span>
              {qna.length > 0 && (
                <ul>
                  {qna.map(([q, a], i) => (
                    <li key={i}>
                      <p className="gp-q"><b>Q</b><span>{q}</span></p>
                      <p className="gp-a"><b>A</b><span>{a}</span></p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>,
        )}

        {sec('plan', '04', '약속과 일정', 'PROMISE · PLAN', 'leaf',
          <>
            <span className="gp-label">약속</span>
            {promises.length > 0 && (
              <div className="gp-pgroups">
                {promiseGroups.map(([who, items]) => (
                  <div key={who} className={'gp-pgroup' + (who === '함께' ? ' is-both' : isPcName(who) ? ' is-pc' : '')}>
                    <span className="gp-pgroup-who">{who}</span>
                    <ul className="gp-plist">
                      {items.map(([what, state], i) => (
                        <li key={i} className={state === '완료' ? 'is-done' : undefined}>
                          <i aria-hidden="true">✦</i>
                          <span>{what}</span>
                          {state && <em>{state === '완료' ? '✓ 완료' : state}</em>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <span className="gp-label">일정</span>
            <div className="gp-tabs" role="group" aria-label="일정 기간">
              {terms.map(t => (
                <button type="button" key={t} aria-pressed={currentTerm === t} onClick={() => setTerm(t)}>
                  {t}
                  <b>{planBuckets[t].length}</b>
                </button>
              ))}
            </div>
            {planBuckets[currentTerm].length > 0 && (
              <ul className="gp-sched">
                {planBuckets[currentTerm].map(([when, what], i) => (
                  <li key={i}>
                    {when && <b>{when}</b>}
                    <span>{what}</span>
                  </li>
                ))}
              </ul>
            )}
          </>,
        )}

        {sec('record', '05', '우리의 기록', 'RECORD SHEET', 'lav',
          <>
            <ul className="gp-rec">
              <li><b>만난 지</b><span>{met.big}{met.sub && <em> · {met.sub}부터</em>}</span></li>
              <li><b>사귄 지</b><span>{love.big}{love.sub && <em> · {love.sub}부터</em>}</span></li>
              <li><b>키스</b><span>{s.키스 !== '' && s.키스 + '번'}</span></li>
              <li><b>NSFW</b><span>{s.NSFW !== '' && s.NSFW + '번'}</span></li>
            </ul>
            <div className={'gp-player' + (playing ? ' is-playing' : '')}>
              <div className="gp-pl-top">
                <span>PLAYLIST · 이 장면의 선곡</span>
                <span className="gp-eq" aria-hidden="true"><i /><i /><i /><i /></span>
              </div>
              <div className="gp-pl-track">
                <div className="gp-cover" aria-hidden="true"><span>♪</span></div>
                <div className="gp-pl-text">
                  <b>{song.title}</b>
                  <span>{song.artist}</span>
                </div>
                <button type="button" className={'gp-like' + (liked ? ' is-on' : '')} aria-pressed={liked} aria-label="좋아요" onClick={() => setLiked(v => !v)}>
                  {liked ? '♥' : '♡'}
                </button>
              </div>
              <p className="gp-sing" aria-label={'가사: ' + (lyric || '')}>
                {Array.from(lyric).map((ch, i, arr) => (
                  <span key={i} aria-hidden="true" style={{ animationDelay: (i / arr.length) * 5 + 's' }}>{ch}</span>
                ))}
              </p>
              {song.trans && <p className="gp-trans">{song.trans}</p>}
              <div className="gp-bar">
                <span>{clock(elapsed)}</span>
                <div className="gp-bar-line"><i style={{ width: (elapsed / total) * 100 + '%' }} /></div>
                <span>-{clock(total - elapsed)}</span>
              </div>
              <div className="gp-ctrl">
                <button type="button" aria-label="셔플" className="gp-sub">⇄</button>
                <button type="button" aria-label="이전 곡" onClick={() => setElapsed(0)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor" /></svg>
                </button>
                <button type="button" className="gp-play" aria-label={playing ? '일시정지' : '재생'} onClick={() => setPlaying(v => !v)}>
                  {playing ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                  )}
                </button>
                <button type="button" aria-label="다음 곡" onClick={() => setElapsed(0)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor" /></svg>
                </button>
                <button type="button" aria-label="반복" className="gp-sub">↻</button>
              </div>
            </div>
          </>,
        )}
      </div>
    </div>
  );
}

/* 카드 스타일 — 사용자가 준 상태창 그대로 */
const CSS = `
.gp{--leaf:#5f8f5a;--leaf-d:#3d6239;--leaf-l:#e6f1e1;--lav:#9c86d4;--lav-d:#6a559f;--lav-l:#efe9fa;--paper:#fdfcf6;--ink:#36423a;--muted:#8b9689;--line:#dfe5d8;
box-sizing:border-box;width:100%;max-width:520px;margin:12px auto;overflow:hidden;padding:14px 12px;border-radius:18px;
background:radial-gradient(circle at 18% 12%,#f6f2fd 0,transparent 45%),radial-gradient(circle at 90% 90%,#e4efe0 0,transparent 50%),#ebe6f4;
font:12px/1.6 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:var(--ink);text-align:left;color-scheme:light}
.gp *,.gp *:before,.gp *:after{box-sizing:border-box}
.gp button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;text-align:left}
.gp button:focus-visible{outline:2px solid var(--lav);outline-offset:2px}
.gp-err{margin-bottom:8px;padding:6px 10px;border-radius:8px;background:#fff3f3;color:#a0525e;font-size:10px}
.gp-st{position:relative;padding:6px;background:radial-gradient(circle,transparent 0 3.1px,var(--paper) 3.5px) -6px -6px/12px 12px;filter:drop-shadow(0 3px 6px rgba(88,72,128,.14))}
.gp-in{position:relative;background:var(--paper);box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px var(--line)}
.gp-st+.gp-st,.gp-fold .gp-st{margin-top:10px}
.gp-head .gp-in{padding:14px 14px 10px;box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px var(--leaf)}
.gp-head-top{display:flex;align-items:center;gap:10px}
.gp-denom{flex-shrink:0;display:grid;place-items:center;width:54px;height:62px;border-radius:3px;background:linear-gradient(160deg,var(--leaf),var(--leaf-d));color:#fff;text-align:center}
.gp-denom small{font-size:7px;font-weight:700;letter-spacing:.2em;opacity:.85;line-height:1}
.gp-denom b{font:900 24px/1 'Noto Serif KR',serif}
.gp-title{flex:1;min-width:0}
.gp-title small{display:block;font-size:8.5px;font-weight:700;letter-spacing:0;color:var(--lav-d);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:clip}
.gp-title strong{display:block;font:900 19px/1.2 'Noto Serif KR',serif;color:var(--leaf-d);letter-spacing:-.02em}
.gp-title em{display:block;font-style:normal;font-size:9px;color:var(--muted)}
.gp-postmark{flex-shrink:0;width:124px;height:72px;color:var(--lav-d);opacity:.88;transform:rotate(-6deg)}
.gp-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px 12px;margin-top:9px}
.gp-stamps{display:flex;justify-content:space-around;flex-wrap:nowrap;gap:4px;margin-top:12px;padding:13px 0 2px;border-top:1px dashed var(--line)}
.gp-stamp{display:flex!important;flex-direction:column;align-items:center;gap:4px;flex:1 1 0;max-width:60px;min-width:0;text-align:center!important;transition:transform .25s}
.gp-stamp-perf{padding:3px;background:radial-gradient(circle,transparent 0 1.8px,#fff 2.2px) -4px -4px/8px 8px;filter:drop-shadow(0 1px 1.5px rgba(70,60,100,.22));transition:transform .25s,filter .25s}
.gp-stamp-face{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:36px;height:42px;color:#fff;box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3px #ffffff80}
.gp-stamp-face small{font-size:5px;font-weight:900;letter-spacing:.14em;opacity:.9}
.gp-stamp-face svg{width:17px;height:17px}
.gp-stamp.is-people .gp-stamp-face{background:linear-gradient(160deg,#79a873,#3d6239)}
.gp-stamp.is-daily .gp-stamp-face{background:linear-gradient(160deg,#b8a6e6,#7a64b6)}
.gp-stamp.is-plan .gp-stamp-face{background:repeating-linear-gradient(135deg,#9bcfb0 0 6px,#86c19f 6px 12px)}
.gp-stamp.is-secret .gp-stamp-face{background:linear-gradient(160deg,#8a74c4,#4e3b86)}
.gp-stamp.is-secret .gp-stamp-perf{transform:rotate(-2deg)}
.gp-stamp.is-record .gp-stamp-face{background:radial-gradient(circle at 50% 40%,#e6d6f7,#a58bd6 75%)}
.gp-stamp.is-people .gp-stamp-perf{transform:rotate(-3deg)}
.gp-stamp.is-daily .gp-stamp-perf{transform:rotate(2deg)}
.gp-stamp.is-plan .gp-stamp-perf{transform:rotate(-1.5deg)}
.gp-stamp.is-record .gp-stamp-perf{transform:rotate(3deg)}
.gp-stamp.is-on .gp-stamp-perf{transform:translateY(-4px) rotate(0) scale(1.06);filter:drop-shadow(0 5px 6px rgba(70,60,100,.28))}
.gp-stamp-label{max-width:100%;font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gp-stamp.is-on .gp-stamp-label{font-weight:700;color:var(--leaf-d)}
.gp-stamp.is-on .gp-stamp-label:after{content:"";display:block;width:4px;height:4px;margin:3px auto 0;border-radius:50%;background:var(--lav)}
.gp-panel{animation:gp-open .3s ease both}
.gp-body .gp-st{margin-top:10px}
.gp-panel.is-leaf .gp-in{box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px #b9d3b2}
.gp-panel.is-lav .gp-in{box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px #d3c8ef}
.gp-close{display:grid!important;place-items:center;width:26px;height:26px;border-radius:50%;font-size:17px!important;line-height:1;color:var(--muted)!important;text-align:center!important}
@keyframes gp-open{from{opacity:0;transform:translateY(-6px)}}
.gp-chip{display:inline-flex;align-items:center;gap:4px;padding:0;background:none;font-size:10px;line-height:18px;color:var(--leaf-d);max-width:100%}
.gp-chip i{font-style:normal;font-size:7px;font-weight:900;letter-spacing:.1em;color:var(--leaf)}
.gp-chip.is-lav{color:var(--lav-d)}
.gp-chip.is-lav i{color:var(--lav)}
.gp-chip span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gp-chip svg{flex-shrink:0}
.gp-gauge{display:flex;align-items:center;gap:6px}
.gp-gauge small{font-size:9px;font-weight:700;color:var(--muted);white-space:nowrap}
.gp-gauge-bar{position:relative;width:92px;height:6px;border-radius:999px;overflow:hidden}
.gp-gauge-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background-size:calc(100% * 100 / var(--t)) 100%;transition:width .6s ease}
.gp-gauge.is-tense small{color:#8a4a6a}
.gp-gauge.is-tense .gp-gauge-bar{background:#f1e6ee;box-shadow:inset 0 0 0 1px #e3cbd8}
.gp-gauge.is-tense .gp-gauge-bar i{background-image:linear-gradient(90deg,#9c86d4,#b5527a 65%,#8c2443)}
.gp-gauge.is-tense.is-alert .gp-gauge-bar i{animation:gp-tense var(--sp) ease-in-out infinite}
.gp-gauge.is-tense.is-alert .gp-gauge-bar i:after{content:"";position:absolute;right:0;top:0;bottom:0;width:3px;border-radius:999px;background:#fff;opacity:.7;animation:gp-jitter .18s steps(2) infinite}
.gp-gauge.is-happy small{color:var(--leaf-d)}
.gp-gauge.is-happy .gp-gauge-bar{background:#eef5e6;box-shadow:inset 0 0 0 1px #d6e8c8}
.gp-gauge.is-happy .gp-gauge-bar i{background-image:linear-gradient(90deg,#9fd1a0,#d9e58a 55%,#f5c96b);overflow:hidden}
.gp-gauge.is-happy .gp-gauge-bar i:after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:40%;background:linear-gradient(90deg,transparent,#ffffffcc,transparent);animation:gp-shine 2.6s ease-in-out infinite}
@keyframes gp-tense{0%,100%{filter:brightness(1);transform:translateX(0)}45%{filter:brightness(1.18)}50%{transform:translateX(.6px)}55%{transform:translateX(-.6px)}}
@keyframes gp-jitter{50%{transform:translateX(-1px)}}
@keyframes gp-shine{0%{left:-40%}60%,100%{left:110%}}
.gp-chip-sky{min-width:0}
.gp-chip-at{min-width:0;align-items:flex-start}
.gp-chip-at span{white-space:normal;overflow:visible;overflow-wrap:anywhere}
.gp-chip-at svg{margin-top:3px}
.gp-toggle{display:block;width:100%;margin-top:9px;padding:5px 0;border-top:1px solid var(--line)!important;font-size:9px!important;font-weight:700;letter-spacing:.14em;color:var(--muted)!important;text-align:center!important}
.gp-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s ease}
.gp-fold.is-open{grid-template-rows:1fr}
.gp-fold>div{min-height:0;overflow:hidden}
.gp-body{padding:0 0 2px}
.gp-sec .gp-in{padding:4px}
.gp-sec-head{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px}
.gp-no{flex-shrink:0;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font:900 11px/1 'Noto Serif KR',serif;background:var(--leaf-l);color:var(--leaf-d);box-shadow:0 0 0 2px var(--paper),0 0 0 3px var(--leaf-l)}
.gp-sec.is-lav .gp-no{background:var(--lav-l);color:var(--lav-d);box-shadow:0 0 0 2px var(--paper),0 0 0 3px var(--lav-l)}
.gp-sec-title{flex:1;min-width:0}
.gp-sec-title small{display:block;font-size:7px;font-weight:700;letter-spacing:.2em;color:var(--muted);line-height:1.3}
.gp-sec-title b{font:700 13px/1.4 'Noto Serif KR',serif;color:var(--ink)}
.gp-chev{font-size:11px;color:var(--muted);transition:transform .3s}
.gp-sec.is-open .gp-chev{transform:rotate(180deg)}
.gp-sec.is-open.is-leaf .gp-in{box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px #b9d3b2}
.gp-sec.is-open.is-lav .gp-in{box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 5px #d3c8ef}
.gp-sec-body{padding:2px 10px 12px}
.gp-label{display:block;margin:12px 0 5px;font-size:8px;font-weight:700;letter-spacing:.16em;color:var(--muted)}
.gp-label:first-child{margin-top:2px}
.gp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:7px;row-gap:0}
.gp-cell{min-width:0;padding:0 10px;border-style:solid;border-width:0 1px}
.gp-cell.is-top{border-top-width:1px;border-radius:10px 10px 0 0;padding-top:9px}
.gp-cell.is-bot{border-bottom-width:1px;border-radius:0 0 10px 10px;padding-bottom:10px}
.gp-grid.is-people .gp-cell.is-C{background:#f3f9f0;border-color:#cfe2c9}
.gp-grid.is-people .gp-cell.is-U{background:#f6f2fd;border-color:#ddd3f3}
.gp-grid.is-people .gp-person-head{padding:0 0 6px}
.gp-grid.is-people .gp-cell.is-U .gp-tag{background:var(--lav)}
.gp-row{padding:6px 0;border-top:1px dashed var(--line)}
.gp-row-label{display:block;font-size:8px;font-weight:700;letter-spacing:.12em;color:var(--leaf)}
.gp-cell.is-U .gp-row-label{color:var(--lav)}
.gp-row p{margin:1px 0 0;font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.gp-grid.is-daily .gp-cell{border-width:0 0 0 3px;padding:3px 10px}
.gp-grid.is-daily .gp-cell.is-top{padding-top:9px;border-radius:10px 10px 0 0}
.gp-grid.is-daily .gp-cell.is-bot{padding-bottom:10px;border-radius:0 0 10px 10px}
.gp-grid.is-daily .gp-cell.is-C{background:#f5f9f2;border-color:var(--leaf)}
.gp-grid.is-daily .gp-cell.is-U{background:#f7f4fd;border-color:var(--lav)}
.gp-cell-name{display:block;font:700 12px/1.4 'Noto Serif KR',serif;overflow-wrap:anywhere}
.gp-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.gp-person{min-width:0;border-radius:10px;border:1px solid #cfe2c9;background:linear-gradient(170deg,#f3f9f0,var(--paper))}
.gp-person.is-U{border-color:#ddd3f3;background:linear-gradient(170deg,#f6f2fd,var(--paper))}
.gp-person-head{display:grid;gap:1px;padding:9px 10px 6px}
.gp-tag{grid-column:1/-1;width:fit-content;padding:0 6px;border-radius:3px;font-size:7px;font-weight:900;letter-spacing:.14em;line-height:14px;background:var(--leaf);color:#fff}
.gp-person.is-U .gp-tag{background:var(--lav)}
.gp-person-head b{min-width:0;font:700 14px/1.4 'Noto Serif KR',serif;overflow-wrap:anywhere}
.gp-person-head i{grid-row:2/4;grid-column:2;align-self:center;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;font-style:normal;font-size:13px;line-height:1;background:var(--paper);border:1px solid var(--line);color:var(--muted)}
.gp-person-head small{font-size:10px;color:var(--muted)}
.gp-dl{margin:0;padding:0 10px 10px}
.gp-dl>div{padding:6px 0;border-top:1px dashed var(--line)}
.gp-dl dt{font-size:8px;font-weight:700;letter-spacing:.12em;color:var(--leaf)}
.gp-person.is-U .gp-dl dt{color:var(--lav)}
.gp-dl dd{margin:1px 0 0;font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.gp-daily{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.gp-dbox{min-width:0;padding:9px 10px;border-radius:10px;background:#f5f9f2;border-left:3px solid var(--leaf)}
.gp-dbox.is-U{background:#f7f4fd;border-left-color:var(--lav)}
.gp-dbox>b{display:block;font:700 12px/1.4 'Noto Serif KR',serif;margin-bottom:5px;overflow-wrap:anywhere}
.gp-mini{font-size:8px;font-weight:700;letter-spacing:.1em;color:var(--muted);margin:6px 0 3px}
.gp-bag{display:flex;flex-wrap:wrap;gap:3px}
.gp-bag span{padding:0 7px;border-radius:999px;background:var(--paper);border:1px solid var(--line);font-size:10px;line-height:18px}
.gp-care{display:grid;gap:4px}
.gp-care-row{display:flex;align-items:baseline;gap:5px;font-size:10px;line-height:1.5}
.gp-care-row b{flex-shrink:0;font-weight:700}
.gp-care-row em{flex-shrink:0;padding:0 6px;border-radius:999px;font-style:normal;font-size:8px;font-weight:700;line-height:15px;background:#eef0ec;color:var(--muted)}
.gp-care-row em.is-done{background:var(--leaf);color:#fff}
.gp-care-row em.is-not{background:var(--lav-l);color:var(--lav-d)}
.gp-care-row span{min-width:0;color:#5f6b60;overflow-wrap:anywhere}
.gp-touch{display:flex;align-items:flex-start;gap:9px;margin-top:8px;padding:9px 11px;border-radius:10px;background:linear-gradient(100deg,var(--lav-l),#f3f8f0)}
.gp-touch i{font-style:normal;font-size:15px;color:var(--lav)}
.gp-touch div{flex:1;min-width:0}
.gp-touch small{display:block;font-size:8px;font-weight:700;letter-spacing:.14em;color:var(--lav-d)}
.gp-touch p{margin:0;font-size:11px;line-height:1.55;overflow-wrap:anywhere}
.gp-fine{display:flex;align-items:flex-start;gap:9px;margin-top:8px;padding:9px 11px;border-radius:10px;background:linear-gradient(100deg,#eef6ea,#f6f3fc);border:1px solid #d6e8c8}
.gp-fine>i{flex-shrink:0;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;font-style:normal;font-size:10px;font-weight:900;background:var(--leaf);color:#fff}
.gp-fine>div{flex:1;min-width:0}
.gp-fine-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.gp-fine-head small{font-size:8px;font-weight:700;letter-spacing:.14em;color:var(--leaf-d)}
.gp-fine-head b{font-size:11px;font-weight:800;color:var(--leaf-d);font-variant-numeric:tabular-nums;white-space:nowrap}
.gp-fine .gp-touch-list li:before{background:var(--leaf)}
.gp-fine-total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:5px;padding-top:5px;border-top:1px solid #d6e8c8}
.gp-fine-total span{font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--leaf-d)}
.gp-fine-total b{font-size:12px;font-weight:800;color:var(--leaf-d);font-variant-numeric:tabular-nums}
.gp-touch-list{display:grid;gap:2px;margin:2px 0 0;padding:0;list-style:none}
.gp-touch-list li{position:relative;padding-left:10px;font-size:11px;line-height:1.55;overflow-wrap:anywhere}
.gp-touch-list li:before{content:"";position:absolute;left:1px;top:.62em;width:4px;height:4px;border-radius:50%;background:var(--lav)}
.gp-cat{margin-top:8px;padding:10px 11px;border-radius:10px;background:#f5f9f2;border:1px dashed #b9d3b2}
.gp-cat-head{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.gp-cat-stamp{flex-shrink:0;padding:3px;background:radial-gradient(circle,transparent 0 1.6px,#fff 2px) -3.5px -3.5px/7px 7px;filter:drop-shadow(0 1px 1.5px rgba(70,60,100,.25));transform:rotate(-4deg)}
.gp-cat-stamp svg{display:block;width:34px;height:34px;padding:5px;background:linear-gradient(160deg,#9bcfb0,#5f8f5a);color:#fff;box-shadow:inset 0 0 0 2px #fff}
.gp-cat-head small{display:block;font-size:7px;font-weight:700;letter-spacing:.18em;color:var(--leaf)}
.gp-cat-head b{font:700 13px/1.3 'Noto Serif KR',serif}
.gp-cat-mind{position:relative;margin:8px 0 0;padding:8px 10px;border-radius:4px 10px 10px 10px;background:var(--paper);border:1px solid #d3c8ef;font-size:11px;line-height:1.6;color:var(--lav-d);overflow-wrap:anywhere}
.gp-cat-mind span{display:block;font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--muted)}
.gp-secret{position:relative;padding:12px 13px;border-radius:10px;background:linear-gradient(165deg,#f1ecfb,var(--paper));border:1px solid #d3c8ef}
.gp-secret p{margin:4px 0 0;font:500 12px/1.85 'Noto Serif KR',serif;color:var(--lav-d);white-space:pre-wrap;overflow-wrap:anywhere}
.gp-secret p{min-height:1.85em}
.gp-caret{display:inline-block;width:1.5px;height:1.05em;margin-left:2px;vertical-align:-.15em;background:var(--lav-d);animation:gp-caret 1s steps(1) infinite}
@keyframes gp-caret{50%{opacity:0}}
.gp-tmi{margin-top:8px;padding:10px 12px;border-radius:10px;background:#f5f9f2;border:1px solid #b9d3b2}
.gp-tmi p{margin:3px 0 0;font-size:11px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
.gp-qna{margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--paper);border:1px solid #d3c8ef}
.gp-qna ul{display:grid;gap:8px;margin:7px 0 0;padding:0;list-style:none}
.gp-qna li{padding-top:8px;border-top:1px dashed var(--line)}
.gp-qna li:first-child{padding-top:0;border-top:0}
.gp-q,.gp-a{display:flex;gap:7px;margin:0;font-size:11px;line-height:1.65;overflow-wrap:anywhere}
.gp-q b,.gp-a b{flex-shrink:0;font:900 11px/1.65 'Noto Serif KR',serif}
.gp-q b{color:var(--lav-d)}
.gp-q span{font-weight:700}
.gp-a{margin-top:2px}
.gp-a b{color:var(--leaf)}
.gp-a span{min-width:0;color:#4f5c50;white-space:pre-wrap}
.gp-secret-label{display:inline-block;padding:0 7px;border-radius:3px;font-size:8px;font-weight:900;letter-spacing:.14em;line-height:15px;background:var(--lav);color:#fff}
.gp-tmi .gp-secret-label{background:var(--leaf)}
.gp-player{margin-top:8px;padding:11px 12px 10px;border-radius:12px;background:linear-gradient(165deg,#f4f0fc,#eef6ea);border:1px solid #d9cff0}
.gp-pl-top{display:flex;align-items:center;justify-content:space-between;font-size:7px;font-weight:700;letter-spacing:.18em;color:var(--lav-d)}
.gp-eq{display:flex;align-items:flex-end;gap:2px;height:10px}
.gp-eq i{width:2px;height:100%;border-radius:2px;background:var(--leaf);transform-origin:bottom;transform:scaleY(.3)}
.gp-player.is-playing .gp-eq i{animation:gp-eq .9s ease-in-out infinite alternate}
.gp-eq i:nth-child(2){animation-delay:-.3s!important}.gp-eq i:nth-child(3){animation-delay:-.6s!important}.gp-eq i:nth-child(4){animation-delay:-.15s!important}
.gp-pl-track{display:flex;align-items:center;gap:11px;margin-top:9px}
.gp-cover{flex-shrink:0;padding:3px;background:radial-gradient(circle,transparent 0 1.8px,var(--paper) 2.1px) -4px -4px/8px 8px;filter:drop-shadow(0 2px 4px rgba(88,72,128,.18))}
.gp-cover span{display:grid;place-items:center;width:46px;height:46px;background:linear-gradient(145deg,var(--lav),var(--leaf));color:#fff;font-size:20px;box-shadow:inset 0 0 0 3px var(--paper)}
.gp-player.is-playing .gp-cover span{animation:gp-bob 2.4s ease-in-out infinite}
.gp-pl-text{flex:1;min-width:0}
.gp-pl-text b{display:block;font:700 14px/1.35 'Noto Serif KR',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gp-pl-text span{display:block;font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gp-like{flex-shrink:0;width:28px;height:28px;display:grid!important;place-items:center;border-radius:50%;font-size:15px!important;color:var(--lav)!important;text-align:center!important}
.gp-like.is-on{color:#d0708f!important;animation:gp-pop .3s ease-out}
.gp-sing{margin:12px 0 4px;padding:0 4px;text-align:center;font:700 13px/1.75 'Noto Serif KR',serif;color:#b8b0c8;word-break:keep-all;overflow-wrap:anywhere}
.gp-trans{margin:-2px 0 4px;padding:0 4px;text-align:center;font-size:9.5px;line-height:1.5;color:#8f84a8;word-break:keep-all;overflow-wrap:anywhere}
.gp-sing span{white-space:pre-wrap;animation:gp-sing 8s linear infinite both;animation-play-state:paused}
.gp-player.is-playing .gp-sing span{animation-play-state:running}
.gp-bar{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:8px;color:var(--muted);font-variant-numeric:tabular-nums}
.gp-bar-line{position:relative;flex:1;height:3px;border-radius:999px;background:#ffffffaa}
.gp-bar-line i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,var(--leaf),var(--lav));transition:width 1s linear}
.gp-bar-line i:after{content:"";position:absolute;right:-4px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:var(--lav-d);box-shadow:0 0 0 3px #9c86d433}
.gp-ctrl{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:8px}
.gp-ctrl button{display:grid!important;place-items:center;width:30px;height:30px;border-radius:50%;color:var(--leaf-d)!important;text-align:center!important}
.gp-ctrl .gp-sub{font-size:13px!important;color:var(--muted)!important}
.gp-ctrl .gp-play{width:38px;height:38px;background:linear-gradient(145deg,var(--leaf),var(--lav))!important;color:#fff!important;box-shadow:0 3px 9px #9c86d455}
@keyframes gp-eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}
@keyframes gp-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}
@keyframes gp-sing{0%{color:#b8b0c8;text-shadow:none}3%,82%{color:var(--leaf-d);text-shadow:0 0 8px #9c86d455}92%,100%{color:#b8b0c8;text-shadow:none}}
@keyframes gp-pop{50%{transform:scale(1.3)}}
.gp-pgroups{display:grid;gap:7px}
.gp-pgroup{padding:9px 11px;border-radius:9px;background:#f5f9f2;border:1px solid #dbe8d5}
.gp-pgroup.is-both{border-color:transparent;background:linear-gradient(120deg,#eff6eb,#f4effc) padding-box,linear-gradient(120deg,#b9d3b2,#d3c8ef) border-box}
.gp-pgroup.is-pc{background:#f6f2fd;border-color:#ddd3f3}
.gp-pgroup-who{display:inline-block;margin-bottom:4px;padding:0 7px;border-radius:3px;font-size:8px;font-weight:900;letter-spacing:.1em;line-height:15px;background:var(--leaf);color:#fff}
.gp-pgroup.is-both .gp-pgroup-who{background:linear-gradient(90deg,var(--leaf),var(--lav))}
.gp-pgroup.is-pc .gp-pgroup-who{background:var(--lav)}
.gp-plist{display:grid;gap:0;margin:0;padding:0;list-style:none}
.gp-plist li{display:flex;align-items:baseline;gap:7px;padding:5px 0;border-top:1px dashed var(--line);font-size:11px;line-height:1.55}
.gp-plist li:first-child{border-top:0}
.gp-plist li>i{flex-shrink:0;font-style:normal;font-size:9px;color:var(--leaf)}
.gp-pgroup.is-both .gp-plist li>i{color:#7f8fb0}
.gp-pgroup.is-pc .gp-plist li>i{color:var(--lav)}
.gp-plist li>span{flex:1;min-width:0;overflow-wrap:anywhere}
.gp-plist em{flex-shrink:0;align-self:center;padding:0 7px;border-radius:999px;font-style:normal;font-size:8px;font-weight:700;line-height:16px;background:var(--lav-l);color:var(--lav-d)}
.gp-plist li.is-done{opacity:.55}
.gp-plist li.is-done span{text-decoration:line-through}
.gp-plist li.is-done em{background:var(--leaf);color:#fff}
.gp-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;padding:3px;border-radius:9px;background:#f1eef8}
.gp-tabs button{display:flex!important;align-items:center;justify-content:center;gap:5px;padding:6px 0!important;border-radius:7px;font-size:11px!important;color:var(--muted)!important;text-align:center!important}
.gp-tabs button b{min-width:16px;padding:0 4px;border-radius:5px;background:#fff;font-size:9px;line-height:15px;text-align:center}
.gp-tabs button[aria-pressed=true]{background:var(--lav)!important;color:#fff!important;font-weight:700}
.gp-tabs button[aria-pressed=true] b{background:#ffffff40;color:#fff}
.gp-sched{display:grid;gap:4px;margin:8px 0 0;padding:0;list-style:none}
.gp-sched li{display:flex;align-items:baseline;gap:9px;padding:6px 2px;border-bottom:1px dashed var(--line);font-size:11px;line-height:1.55}
.gp-sched li:last-child{border-bottom:0}
.gp-sched b{flex-shrink:0;min-width:58px;font-weight:700;color:var(--lav-d)}
.gp-sched span{min-width:0;overflow-wrap:anywhere}
.gp-rec{display:grid;gap:0;margin:0;padding:0;list-style:none}
.gp-rec li{display:flex;align-items:baseline;gap:10px;padding:6px 2px;border-bottom:1px dashed var(--line);font-size:11px;line-height:1.55}
.gp-rec li:last-child{border-bottom:0}
.gp-rec b{flex-shrink:0;min-width:52px;font-weight:700;color:var(--lav-d)}
.gp-rec span{min-width:0;overflow-wrap:anywhere}
.gp-rec em{font-style:normal;font-size:10px;color:var(--muted)}
@media(max-width:400px){.gp{padding:12px 9px}.gp-postmark{width:94px;height:55px}.gp-head-top{gap:7px}.gp-title strong{font-size:16px}.gp-denom{width:46px;height:54px}.gp-denom b{font-size:20px}}
@media(prefers-reduced-motion:reduce){.gp *{transition:none!important}}
`;
