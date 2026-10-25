'use client';
// 가입 신청 목록 (사용자 요청) — 트위터 아이디로 가입 신청한 사람을 관리자가 수락·거절한다.
// 환경설정 회원/보안 탭과 모바일 메뉴(가입 신청 창)에서 같이 쓴다 — 휴대폰에서도 누르기 쉽게 큰 버튼
import React, { useState } from 'react';
import { backend } from '@/lib/backend';
import { mockApprove, mockReject } from '@/lib/auth';
import { MemberLite } from '@/lib/members';
import { useToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/Modal';

const fmt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function PendingMembers({ list, reload, empty = '가입 신청이 없어요' }: {
  list: MemberLite[];
  reload: () => void;
  empty?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rej, setRej] = useState<MemberLite | null>(null);
  const pending = list.filter(m => m.pending);

  const run = async (m: MemberLite, ok: boolean) => {
    setBusy(m.id);
    try {
      const be = backend();
      if (be) await (ok ? be.approveMember(m.id) : be.deleteMember(m.id));
      else (ok ? mockApprove : mockReject)(m.id);
      toast(ok ? `${m.nickname} 님의 가입을 수락했어요` : `${m.nickname} 님의 가입 신청을 거절했어요`);
      reload();
    } catch (e) {
      toast(`처리하지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(null);
  };

  if (!pending.length) return <p className="pm-empty">{empty}</p>;
  return (
    <div className="pm-list">
      {pending.map(m => (
        <div key={m.id} className="pm-row">
          <div className="pm-who">
            <b>{m.nickname}</b>
            {m.twitter && <span>@{m.twitter}</span>}
            {m.createdAt && <small>{fmt(m.createdAt)} 신청</small>}
          </div>
          <div className="pm-act">
            <button type="button" className="btn btn-ghost" disabled={busy === m.id} onClick={() => setRej(m)}>거절</button>
            <button type="button" className="btn btn-dark" disabled={busy === m.id} onClick={() => { void run(m, true); }}>수락</button>
          </div>
        </div>
      ))}
      <ConfirmModal open={rej !== null} title="가입 신청을 거절할까요?"
        body={rej ? `${rej.nickname}${rej.twitter ? ` (@${rej.twitter})` : ''} 님의 신청이 목록에서 사라지고, 이 계정으로는 로그인할 수 없어요.` : undefined}
        onClose={() => setRej(null)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setRej(null) },
          { label: '거절', kind: 'accent', onClick: () => { const m = rej; setRej(null); if (m) void run(m, false); } },
        ]} />
    </div>
  );
}
