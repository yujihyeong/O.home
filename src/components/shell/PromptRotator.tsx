'use client';
// 프롬프트 게시판 비밀번호 매달 자동 변경 (사용자 요청) — 관리자가 홈에 들어와 있을 때,
// 달이 바뀌었으면 새 4글자로 다시 잠그고 관리자에게 알림으로 새 비밀번호를 알려 준다.
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { rotatePromptPasswordIfDue } from '@/lib/promptStore';
import { pushNotif } from '@/lib/notifStore';

export function PromptRotator() {
  const { user, isAdmin } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    if (!isAdmin || !uid) return;
    let alive = true;
    void rotatePromptPasswordIfDue().then(pw => {
      if (!alive || !pw) return;
      pushNotif({
        type: 'prompt', toUserId: uid,
        title: `프롬프트 비밀번호가 「${pw}」로 바뀌었어요`,
        body: '매달 1일 자동 변경 — 이 기기에서는 비밀번호 없이 그대로 열려요',
        href: '/prompt',
      });
    }).catch(() => { /* 다음 접속 때 다시 */ });
    return () => { alive = false; };
  }, [isAdmin, uid]);
  return null;
}
