'use client';
// 회원정보창 (고정 요소, 4.0) — 비로그인: 로그인한 것과 같은 모양의 손님 카드 (낮 햄스터 · 밤 토끼) + 로그인/회원가입
// 로그인: 프로필 요약 + 마이페이지/로그아웃
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useBlobUrl } from '@/lib/blobStore';
import { useTheme } from '@/lib/ThemeProvider';

/** noTitle: 「MEMBER」 제목 없이 (모바일 메뉴창 맨 위에 넣을 때 — 사용자 요청)
 *  onNav: 버튼을 누르면 먼저 부른다 (메뉴창을 닫는 데 쓴다) */
export function MemberBox({ noTitle, onNav }: { noTitle?: boolean; onNav?: () => void } = {}) {
  const r = useRouter();
  const router = { push: (href: string) => { onNav?.(); r.push(href); } };
  const { user, logout } = useAuth();
  const avatarSrc = useBlobUrl(user?.avatarUrl);
  const night = useTheme().scene === 'night';

  return (
    <div className={`panel login-box ${noTitle ? 'login-box-bare' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      {!noTitle && <h3>MEMBER</h3>}
      {user ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            {/* 기본 아바타는 이니셜 없이 단색/그라데이션 (v1.9) */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: avatarSrc ? undefined : (user.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{user.nickname}</b>
              <small style={{ display: 'block', fontSize: 10.5, color: 'var(--faint)' }}>
                {user.role === 'admin' ? '관리자' : '회원'} · 알림 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>0</span>
              </small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => router.push('/mypage')}>마이페이지</button>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => { onNav?.(); logout(); }}>로그아웃</button>
          </div>
        </>
      ) : (
        /* 비로그인 (사용자 요청) — 로그인했을 때와 같은 모양으로: 동그란 프로필(낮/밤 그림) · 이름 · 「로그인 하지 않은 사용자」
           아래 버튼은 반씩 로그인 / 회원가입 */
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            {/* 프로필 그림 (사용자 제공 — 얼굴 중심 크롭, public/guest) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mb-guest-av" src={night ? '/guest/night.webp' : '/guest/day.webp'} alt="" />
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{night ? '토끼' : '햄스터'}</b>
              <small style={{ display: 'block', fontSize: 10.5, color: 'var(--faint)' }}>로그인 하지 않은 사용자</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => router.push('/login')}>로그인</button>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => router.push('/login?signup=1')}>회원가입</button>
          </div>
        </>
      )}
    </div>
  );
}
