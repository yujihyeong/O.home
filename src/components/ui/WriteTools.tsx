'use client';
// 글쓰기 도구 막대 — 로그 정리 · 맞춤법 검사
// 드래그해서 고른 부분이 있으면 그 부분에만, 없으면 글 전체에 적용한다.
// 텍스트에리어용(TextTools)과 TipTap 에디터용(RichEditor가 SpellPanel을 직접 씀)이 같은 패널을 공유한다.
import React, { useRef, useState } from 'react';
import { expandToLines, findSpelling, SpellIssue, tidyLog } from '@/lib/writeTools';
import { useToast } from '@/components/ui/Toast';

export interface SpellSession {
  issues: SpellIssue[];
  scope: 'sel' | 'all';
}

/** 고칠 때마다 뒤쪽 항목의 위치를 바뀐 글자 수만큼 민다 — 다시 검사하지 않아도 자리가 맞는다 */
export function shiftAfter(list: SpellIssue[], done: SpellIssue): SpellIssue[] {
  const d = done.fix.length - done.wrong.length;
  return list
    .filter(i => i.id !== done.id)
    .map(i => (i.from >= done.to ? { ...i, from: i.from + d, to: i.to + d } : i));
}

/** 맞춤법 결과 패널 — 고치기 / 무시 / 모두 고치기 */
export function SpellPanel({ session, context, onFix, onFixAll, onIgnore, onPick, onClose }: {
  session: SpellSession;
  context: (i: SpellIssue) => [string, string];
  onFix: (i: SpellIssue) => void;
  onFixAll: () => void;
  onIgnore: (i: SpellIssue) => void;
  onPick?: (i: SpellIssue) => void;
  onClose: () => void;
}) {
  const { issues, scope } = session;
  return (
    <div className="sp-panel">
      <div className="sp-head">
        <b>맞춤법 검사</b>
        <span>{scope === 'sel' ? '드래그한 부분' : '글 전체'} · {issues.length ? `${issues.length}곳` : '모두 고쳤습니다'}</span>
        {issues.length > 1 && (
          <button type="button" className="sp-all" onMouseDown={e => e.preventDefault()} onClick={onFixAll}>모두 고치기</button>
        )}
        <button type="button" className="sp-x" aria-label="닫기" onClick={onClose}>✕</button>
      </div>
      {issues.length > 0 && (
        <ul>
          {issues.map(i => {
            const [pre, post] = context(i).map(t => t.replace(/\s+/g, ' ')) as [string, string];
            return (
              <li key={i.id}>
                <div className="sp-line" onClick={() => onPick?.(i)}>
                  <span className="sp-ctx">{pre}</span>
                  <s>{i.wrong.replace(/ /g, '·')}</s>
                  <span className="sp-arrow">→</span>
                  <b>{i.fix.replace(/ /g, '·')}</b>
                  <span className="sp-ctx">{post}</span>
                </div>
                <small>{i.why}</small>
                <div className="sp-acts">
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onFix(i)}>고치기</button>
                  <button type="button" className="ghost" onMouseDown={e => e.preventDefault()} onClick={() => onIgnore(i)}>무시</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const CTX = 14;

/**
 * 텍스트에리어 위에 얹는 도구 막대.
 * children으로 텍스트에리어(KTextarea 등)를 감싸면 그 안의 <textarea>에서 선택 범위를 읽는다.
 */
export function TextTools({ value, onChange, log, children }: {
  value: string;
  onChange: (v: string) => void;
  log?: boolean;              // 로그 정리 버튼 (글쓰기 「로그 정리」 모드)
  children: React.ReactNode;
}) {
  const toast = useToast();
  const wrap = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const [spell, setSpell] = useState<SpellSession | null>(null);

  const ta = () => wrap.current?.querySelector('textarea') ?? null;
  /** 드래그한 범위 — 없으면 글 전체 */
  const range = (): { from: number; to: number; scope: 'sel' | 'all' } => {
    const el = ta();
    const v = latest.current;
    if (el && el.selectionEnd > el.selectionStart) return { from: el.selectionStart, to: el.selectionEnd, scope: 'sel' };
    return { from: 0, to: v.length, scope: 'all' };
  };
  const select = (from: number, to: number) => requestAnimationFrame(() => {
    const el = ta();
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, to);
  });

  const runTidy = () => {
    const v = latest.current;
    if (!v.trim()) { toast('정리할 로그가 없습니다'); return; }
    const r = range();
    const [a, b] = r.scope === 'sel' ? expandToLines(v, r.from, r.to) : [0, v.length];
    const done = tidyLog(v.slice(a, b));
    if (done === v.slice(a, b)) { toast('이미 정리된 로그입니다'); return; }
    onChange(v.slice(0, a) + done + v.slice(b));
    setSpell(null);   // 위치가 바뀌었으니 열린 검사 결과는 닫는다
    if (r.scope === 'sel') select(a, a + done.length);
    toast(r.scope === 'sel' ? '드래그한 부분을 정리했습니다' : '로그 전체를 정리했습니다');
  };

  const runSpell = () => {
    const v = latest.current;
    const r = range();
    const issues = findSpelling(v.slice(r.from, r.to), r.from);
    if (!issues.length) {
      setSpell(null);
      toast(r.scope === 'sel' ? '드래그한 부분에서 고칠 곳을 찾지 못했습니다' : '고칠 곳을 찾지 못했습니다');
      return;
    }
    setSpell({ issues, scope: r.scope });
  };

  const applyOne = (v: string, i: SpellIssue) =>
    (v.slice(i.from, i.to) === i.wrong ? v.slice(0, i.from) + i.fix + v.slice(i.to) : null);

  const fix = (i: SpellIssue) => {
    const next = applyOne(latest.current, i);
    if (next === null) { toast('글이 바뀌어 이 항목을 고치지 못했습니다 — 다시 검사해 주세요'); return; }
    latest.current = next;
    onChange(next);
    setSpell(s => (s ? { ...s, issues: shiftAfter(s.issues, i) } : s));
  };
  const fixAll = () => {
    if (!spell) return;
    let v = latest.current;
    let n = 0;
    // 뒤에서부터 — 앞쪽 위치가 밀리지 않게
    for (const i of [...spell.issues].sort((a, b) => b.from - a.from)) {
      const next = applyOne(v, i);
      if (next !== null) { v = next; n++; }
    }
    latest.current = v;
    onChange(v);
    setSpell(s => (s ? { ...s, issues: [] } : s));
    toast(`${n}곳을 고쳤습니다`);
  };

  return (
    <div className="wt-wrap">
      <div className="wt-bar">
        {log && (
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={runTidy}
            data-tip={'앞뒤에 마크다운이 없는 문장을 ""로 감싸고 줄마다 문단으로 — 드래그하면 그 부분만'}>
            ✎ 로그 정리
          </button>
        )}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={runSpell}
          data-tip="자주 틀리는 맞춤법·띄어쓰기 찾기 — 드래그하면 그 부분만">
          가✓ 맞춤법 검사
        </button>
        <small>드래그하면 그 부분만, 아니면 글 전체에 적용</small>
      </div>
      <div ref={wrap}>{children}</div>
      {spell && (
        <SpellPanel session={spell}
          context={i => [latest.current.slice(Math.max(0, i.from - CTX), i.from), latest.current.slice(i.to, i.to + CTX)]}
          onFix={fix} onFixAll={fixAll}
          onIgnore={i => setSpell(s => (s ? { ...s, issues: s.issues.filter(x => x.id !== i.id) } : s))}
          onPick={i => select(i.from, i.to)}
          onClose={() => setSpell(null)} />
      )}
    </div>
  );
}
