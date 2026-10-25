'use client';
// 비밀번호 입력 화면 — 프롬프트 게시판과 비밀번호 글이 같이 쓴다 (같은 비밀번호)
import { LockIcon } from './Icons';
import React, { useState } from 'react';

export function LockScreen({ onUnlock }: { onUnlock: (pw: string) => Promise<boolean> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const go = async () => {
    if (!pw || busy) return;
    setBusy(true); setBad(false);
    const ok = await onUnlock(pw);
    setBusy(false);
    if (!ok) { setBad(true); setPw(''); }
  };
  return (
    <div className="panel pr-lock">
      <div className="pr-lock-ic" aria-hidden><LockIcon size={30} /></div>
      <p className="pr-lock-t">비밀번호를 입력해 주세요</p>
      <form className={`pr-lock-f ${bad ? 'bad' : ''}`} onSubmit={e => { e.preventDefault(); void go(); }}>
        <input className="pr-in" type="password" value={pw} autoFocus autoComplete="current-password"
          placeholder="비밀번호" onChange={e => { setPw(e.target.value); setBad(false); }} />
        <button type="submit" className="btn btn-dark" disabled={!pw || busy}>{busy ? '…' : '열기'}</button>
      </form>
      {bad && <p className="pr-lock-bad">비밀번호가 맞지 않아요</p>}
    </div>
  );
}
