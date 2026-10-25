'use client';
// 비밀번호 걸기·바꾸기·풀기 창 (사용자 요청) — 게시판·감상타래가 같이 쓴다.
// 자동으로 바뀌는 비밀번호(프롬프트 게시판과 같음) / 직접 정한 비밀번호 중 고른다
import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
/** 게시판 비밀번호 고르기 (사용자 요청) — 자동으로 바뀌는 비밀번호 / 직접 정한 비밀번호 */
export function LockModal({ what = '게시판', open, locked, own, busy, onClose, onLock, onUnlock, onChange }: {
  what?: string; open: boolean; locked: boolean; own: boolean; busy: boolean; onClose: () => void;
  onLock: (own: string | null) => void; onUnlock: () => void; onChange: (pw: string) => void;
}) {
  const [mode, setMode] = useState<'auto' | 'own'>('auto');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  useEffect(() => { if (open) { setMode(own ? 'own' : 'auto'); setA(''); setB(''); } }, [open, own]);
  const ok = a.length >= 4 && a === b;
  const pwFields = (
    <>
      <input className="pr-in" type="password" autoComplete="new-password" placeholder={locked ? '새 비밀번호 (4자 이상)' : '비밀번호 (4자 이상)'} value={a} onChange={e => setA(e.target.value)} />
      <input className="pr-in" type="password" autoComplete="new-password" placeholder="한 번 더" value={b} onChange={e => setB(e.target.value)} />
      {b && a !== b && <p className="hint" style={{ margin: 0, color: 'var(--accent)' }}>두 칸이 서로 달라요</p>}
    </>
  );
  return (
    <Modal open={open} onClose={onClose} small title={locked ? `${what} 비밀번호` : `${what}에 비밀번호 걸기`}
      actions={locked ? (
        <>
          <button className="btn btn-ghost" disabled={busy} onClick={onUnlock}>비밀번호 풀기</button>
          {own && <button className="btn btn-dark" disabled={!ok || busy} onClick={() => onChange(a)}>{busy ? '…' : '바꾸기'}</button>}
        </>
      ) : (
        <button className="btn btn-dark" disabled={busy || (mode === 'own' && !ok)} onClick={() => onLock(mode === 'own' ? a : null)}>{busy ? '…' : '걸기'}</button>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {locked ? (
          <>
            <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
              {own ? <>지금은 <b>직접 정한 비밀번호</b>로 잠겨 있어요. 아래에 새 비밀번호를 적으면 바뀌어요.</>
                : <>지금은 <b>자동으로 바뀌는 비밀번호</b>(프롬프트 게시판과 같음)로 잠겨 있어요. 매달 1일 함께 바뀌어요.</>}
            </p>
            {own && pwFields}
            <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>다른 방식으로 바꾸려면 비밀번호를 풀고 다시 걸어 주세요.</p>
          </>
        ) : (
          <>
            <div className="mini-seg" style={{ alignSelf: 'flex-start' }}>
              <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>자동으로 바뀌는 비밀번호</button>
              <button className={mode === 'own' ? 'on' : ''} onClick={() => setMode('own')}>직접 정하기</button>
            </div>
            {mode === 'auto' ? (
              <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
                프롬프트 게시판과 <b>같은 비밀번호</b>예요. 매달 1일 랜덤 4글자로 함께 바뀌고, 새 비밀번호는 알림으로 알려 드려요.
              </p>
            ) : (
              <>
                {pwFields}
                <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
                  이 {what}만의 비밀번호예요. 자동으로 바뀌지 않아요. <b>잊어버리면 되찾을 방법이 없어요.</b>
                </p>
              </>
            )}
          </>
        )}
        <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
          글 내용·이미지는 비밀번호로 <b>암호화</b>돼 저장돼요. 관리자는 이 기기에서 바로 들어가지고, 다른 기기에서는 한 번만 넣으면 돼요.
        </p>
      </div>
    </Modal>
  );
}
