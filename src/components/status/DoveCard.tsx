'use client';
// 도브(본서사) 상태창 (사용자 요청) — 로판 AI 트래커를 복사해 붙여 넣으면 DOVSI ARCHIVE 카드로 그린다.
// 사용자가 준 카드 HTML을 그대로 옮기고, {{항목}} 자리에 트래커에서 읽은 값을 넣는다.
import React from 'react';

/** 트래커 항목 이름 — 카드의 {{…}} 자리와 같다 */
export const DOVE_FIELDS = [
  '계절', '날짜', '상황',
  'char나이', 'char위치', 'char옷차림', 'char자세', 'char식사', 'char속마음',
  'user나이', 'user위치', 'user옷차림', 'user자세', 'user식사', 'user속마음',
  'char가이딩필요수치', 'char폭주까지남은시간',
  '일정1', '일정2', '약속', '기념일', '섻',
  '임무_위치', '임무_등급', '위험도', '임무_내용',
  '결제항목', '결제금액',
  '삼호상태', '삼호한마디',
] as const;

/** 복사한 트래커 글 → 항목별 값.
 *  「이름 / 값」이 줄을 바꿔 오든, 「이름: 값」「이름(탭)값」으로 한 줄에 오든 받는다.
 *  알려진 이름으로 시작하는 줄에서 새 항목이 시작되고, 그 밖의 줄은 앞 항목에 이어 붙인다.
 *  같은 이름이 또 나오면(값이 그 낱말로 시작하는 경우) 새 항목으로 보지 않는다 */
export function parseDove(text: string): Record<string, string> {
  const names = [...DOVE_FIELDS].sort((a, b) => b.length - a.length);
  const out: Record<string, string> = {};
  let cur: string | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const name = names.find(n => !(n in out) && (line === n || new RegExp(`^${n}(\\s*[:：|]\\s*|\\t+|\\s+)`).test(line)));
    if (name) {
      cur = name;
      out[name] = line.slice(name.length).replace(/^\s*[:：|]?\s*/, '');
      continue;
    }
    if (cur) out[cur] = out[cur] ? `${out[cur]}\n${line}` : line;
  }
  return out;
}

const CSS = `
:host{display:block}
*{box-sizing:border-box}
details>summary{list-style:none}
details>summary::-webkit-details-marker{display:none}
@keyframes dv-flash{0%,50%,100%{opacity:1}25%,75%{opacity:0}}
.dv-flash{animation:dv-flash 2s infinite}
.dv-flash-slow{animation:dv-flash 3s infinite}
.dv-v{white-space:pre-line}
`;

const C = {
  box: { background: '#ffffff', border: '1px solid #e9edf3', borderRadius: 14, padding: '10px 12px', marginBottom: 8 } as React.CSSProperties,
  sum: { cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#5b6a7e', listStyle: 'none', outline: 'none', userSelect: 'none' } as React.CSSProperties,
  ul: { margin: '10px 0 0 0', paddingLeft: 16, fontSize: 12, color: '#4e5968', lineHeight: 1.6 } as React.CSSProperties,
  li: { marginBottom: 3 } as React.CSSProperties,
  key: { color: '#333d4b' } as React.CSSProperties,
  dl: { margin: 0, display: 'grid', gridTemplateColumns: '55px 1fr', gap: '5px 8px', fontSize: 12, lineHeight: 1.4 } as React.CSSProperties,
  dt: { color: '#8b95a1', fontWeight: 500 } as React.CSSProperties,
  dd: { margin: 0, color: '#333d4b' } as React.CSSProperties,
};

/** 픽셀 고양이 한 줄 — [색, 칸 수] 목록 (빈 칸은 '') */
type Px = [string, number][];
const CAT: Px[] = [
  [['', 1], ['#f97316', 1], ['#f97316', 1], ['', 5], ['#374151', 1], ['#374151', 1], ['', 1]],
  [['#f97316', 4], ['', 3], ['#374151', 4]],
  [['#f97316', 1], ['#fbcfe8', 2], ['#f97316', 1], ['', 3], ['#374151', 1], ['#fbcfe8', 2], ['#374151', 1]],
  [['#f97316', 6], ['#374151', 5]],
  [['#f97316', 2], ['#ffffff', 7], ['#374151', 2]],
  [['#f97316', 1], ['#ffffff', 1], ['eye', 1], ['#ffffff', 5], ['eye', 1], ['#ffffff', 1], ['#374151', 1]],
  [['#f97316', 1], ['#fbcfe8', 1], ['#ffffff', 3], ['#f472b6', 1], ['#ffffff', 3], ['#fbcfe8', 1], ['#374151', 1]],
  [['#ffffff', 11]],
  [['', 1], ['#ef4444', 4], ['#f59e0b', 1], ['#ef4444', 4], ['', 1]],
  [['#f97316', 3], ['#ffffff', 5], ['#374151', 3]],
  [['#f97316', 3], ['#ffffff', 2], ['#e2e8f0', 1], ['#ffffff', 2], ['#374151', 3]],
  [['#f97316', 3], ['#f1f5f9', 2], ['#e2e8f0', 1], ['#f1f5f9', 2], ['#374151', 3]],
  [['', 1], ['#ffffff', 9], ['', 1]],
];
const TAIL: Px[] = [
  [['#f97316', 1], ['', 2]],
  [['#f97316', 2], ['', 1]],
  [['', 1], ['#374151', 2]],
  [['', 1], ['#f97316', 2]],
  [['#374151', 2], ['', 1]],
];
function PixelGrid({ rows, cols }: { rows: Px[]; cols: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 7px)`, gridAutoRows: 7 }}>
      {rows.flatMap((row, r) => row.map(([c, n], i) => (
        <span key={`${r}-${i}`} className={c === 'eye' ? 'dv-flash-slow' : undefined}
          style={{ gridColumn: `span ${n}`, background: c === 'eye' ? '#1e293b' : c || 'transparent' }} />
      )))}
    </div>
  );
}

function Person({ dot, name, tag, tagBg, p, v }: {
  dot: string; name: string; tag: string; tagBg: string; p: 'char' | 'user'; v: (k: string) => string;
}) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e9edf3', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dv-flash" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: dot }} />
          <strong style={{ fontSize: 14, color: '#191f28' }}>{name}</strong>
          <small style={{ fontSize: 11, color: '#8b95a1' }}>({v(`${p}나이`)})</small>
        </div>
        <span style={{ fontSize: 10, color: dot, background: tagBg, padding: '2px 6px', borderRadius: 6, fontWeight: 600 }}>{tag}</span>
      </div>
      <dl style={C.dl}>
        <dt style={C.dt}>위치</dt><dd style={C.dd} className="dv-v">{v(`${p}위치`)}</dd>
        <dt style={C.dt}>복장</dt><dd style={C.dd} className="dv-v">{v(`${p}옷차림`)}</dd>
        <dt style={C.dt}>자세</dt><dd style={C.dd} className="dv-v">{v(`${p}자세`)}</dd>
        <dt style={C.dt}>상태</dt><dd style={C.dd} className="dv-v">{v(`${p}식사`)}</dd>
      </dl>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f2f4f6', fontSize: 11, color: '#6b7684', fontStyle: 'italic' }} className="dv-v">
        &quot;{v(`${p}속마음`)}&quot;
      </div>
    </div>
  );
}

export function DoveCard({ text }: { text: string }) {
  const f = parseDove(text);
  const v = (k: string) => f[k] ?? '';
  const pct = Math.max(0, Math.min(100, Number(v('char가이딩필요수치').replace(/[^\d.]/g, '')) || 0));
  return (
    <div style={{
      width: '100%', maxWidth: 480, margin: '0 auto', padding: 16, boxSizing: 'border-box',
      fontFamily: "'Pretendard',-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
      wordBreak: 'keep-all', textWrap: 'pretty', background: '#fbfcfe', border: '1px solid #e1e7f0', borderRadius: 20,
      boxShadow: '0 8px 24px rgba(149,165,185,0.12)', color: '#333d4b', textAlign: 'left',
    } as React.CSSProperties}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px dashed #d5deeb' }}>
        <span style={{ fontSize: 11, letterSpacing: '1.5px', color: '#7a8b9e', fontWeight: 700 }}>DOVSI ARCHIVE</span>
        {v('계절') && <span style={{ fontSize: 11, color: '#8a99ad', background: '#edf2f7', padding: '3px 8px', borderRadius: 12 }}>{v('계절')}</span>}
      </div>
      <div style={{ textAlign: 'center', padding: '14px 0 10px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2b3445', letterSpacing: '-0.3px' }}>{v('날짜')}</div>
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #e9edf3', borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5b6a7e', marginBottom: 6 }}>CURRENT STATUS</div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: '#4e5968', margin: 0 }} className="dv-v">{v('상황')}</p>
      </div>

      <details style={C.box}>
        <summary style={C.sum}>CHARACTER</summary>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Person dot="#e06d6d" name="도브" tag="S-Sentinel" tagBg="#fdeeee" p="char" v={v} />
          <Person dot="#5e7ce2" name="시오" tag="A-Guide" tagBg="#eef2fd" p="user" v={v} />
          <div style={{ background: '#f4f6f9', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5b6a7e', marginBottom: 8 }}>GUIDING METRICS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#6b7684' }}>필요 가이딩</span>
                <strong style={{ color: '#2b3445' }}>{v('char가이딩필요수치').replace(/%\s*$/, '')}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#6b7684' }}>임계 도달</span>
                <span style={{ color: '#e06d6d', fontWeight: 700 }}>{v('char폭주까지남은시간')}</span>
              </div>
              <div style={{ width: '100%', background: '#e5e9f0', height: 8, borderRadius: 4, position: 'relative', marginTop: 6, marginBottom: 4 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #fca5a5 0%, #e06d6d 50%, #b91c1c 100%)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, background: '#ffffff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', border: '1px solid #f8aba6' }} />
              </div>
            </div>
          </div>
        </div>
      </details>

      <details style={C.box}>
        <summary style={C.sum}>SCHEDULE &amp; RECORD</summary>
        <ul style={C.ul}>
          <li style={C.li}><strong style={C.key}>단기 일정:</strong> <span className="dv-v">{v('일정1')}</span></li>
          <li style={C.li}><strong style={C.key}>장기 일정:</strong> <span className="dv-v">{v('일정2')}</span></li>
          <li style={C.li}><strong style={C.key}>약속:</strong> <span className="dv-v">{v('약속')}</span></li>
          <li style={C.li}><strong style={C.key}>기념일:</strong> <span className="dv-v">{v('기념일')}</span></li>
          <li><strong style={C.key}>NSFW:</strong> <span className="dv-v">{v('섻')}</span></li>
        </ul>
      </details>

      <details style={C.box}>
        <summary style={C.sum}>MISSION</summary>
        <ul style={C.ul}>
          <li style={C.li}><strong style={C.key}>위치:</strong> <span className="dv-v">{v('임무_위치')}</span></li>
          <li style={C.li}><strong style={C.key}>등급:</strong> <span className="dv-v">{v('임무_등급')}</span></li>
          <li style={C.li}><strong style={C.key}>위험도:</strong> <span className="dv-v">{v('위험도')}</span></li>
          <li><strong style={C.key}>내용:</strong> <span className="dv-v">{v('임무_내용')}</span></li>
        </ul>
      </details>

      <details style={C.box}>
        <summary style={C.sum}>PAY</summary>
        <div style={{ marginTop: 12 }}>
          <div style={{ background: 'linear-gradient(135deg, #2b2d31 0%, #111214 100%)', borderRadius: 12, padding: 18, color: '#ffffff', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />
            <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 900, fontStyle: 'italic', letterSpacing: 1, marginBottom: 12 }}>VISA</div>
            <div style={{ width: 36, height: 26, background: 'linear-gradient(135deg, #e5c07b, #c69b47)', borderRadius: 5, marginBottom: 14, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.3)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '30%', width: '100%', height: 1, background: 'rgba(0,0,0,0.2)' }} />
              <div style={{ position: 'absolute', top: '60%', width: '100%', height: 1, background: 'rgba(0,0,0,0.2)' }} />
              <div style={{ position: 'absolute', left: '30%', width: 1, height: '100%', background: 'rgba(0,0,0,0.2)' }} />
            </div>
            <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 'clamp(11px, 3.8vw, 15px)', letterSpacing: 2, whiteSpace: 'nowrap', marginBottom: 12, textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>5023-2504-3312-0402</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 12, letterSpacing: '1.5px', color: '#e0e5eb', fontWeight: 500 }}>YU JIHYEONG</div>
              <div style={{ fontSize: 9, color: '#8a99ad', letterSpacing: '0.5px' }}>CREDIT</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5b6a7e', marginBottom: 6 }}>최근 결제 내역</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 4px', borderTop: '1px dashed #e9edf3', fontSize: 12 }}>
              <span style={{ color: '#4e5968', fontWeight: 500 }} className="dv-v">{v('결제항목')}</span>
              <strong style={{ color: '#2b3445', whiteSpace: 'nowrap' }}>{v('결제금액')}</strong>
            </div>
          </div>
        </div>
      </details>

      <details style={{ ...C.box, marginBottom: 0 }}>
        <summary style={C.sum}>MY LOVELY CAT</summary>
        <div style={{ marginTop: 12, padding: '16px 14px', background: '#fcfdfef0', borderRadius: 12, border: '1px dashed #d5deeb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <PixelGrid rows={CAT} cols={11} />
            <div style={{ marginLeft: -2, marginBottom: 2 }}><PixelGrid rows={TAIL} cols={3} /></div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ display: 'inline-block', background: '#ffffff', color: '#475569', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 12, letterSpacing: 1, boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>삼호</span>
          </div>
          <div style={{ width: '100%', marginTop: 16, background: '#ffffff', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
            <dl style={{ ...C.dl, gap: '6px 8px' }}>
              <dt style={{ ...C.dt, fontWeight: 600 }}>상태</dt><dd style={C.dd} className="dv-v">{v('삼호상태')}</dd>
              <dt style={{ ...C.dt, fontWeight: 600 }}>한마디</dt><dd style={C.dd} className="dv-v">&quot;{v('삼호한마디')}&quot;</dd>
            </dl>
          </div>
        </div>
      </details>
    </div>
  );
}
