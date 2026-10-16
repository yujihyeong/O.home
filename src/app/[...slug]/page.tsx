'use client';
// 없는 주소 안내 (v1.9) — 개발 마일스톤 문구 제거, 일반 방문자용 안내만
//
// 짧은 주소로 게시판·섹션 찾아가기 (사용자 제보 — 커스텀 링크에 `LOG2`처럼 게시판 이름만 적었더니
// `/LOG2`라는 없는 페이지로 가서 「주소가 잘못되었거나」가 떴다). 게시판 주소는 원래 `/board?b=<id>`라
// 이름만으로는 갈 수 없었다. 한 단어 주소가 게시판·섹션의 이름·별명·id와 같으면 그곳으로 바로 옮겨 준다.
import React, { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageTitle } from '@/components/ui/PageText';
import { useBoards, boardHref } from '@/lib/boardStore';
import { useSections, SECTION_KINDS, sectionsOf, sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useCustomLinks } from '@/lib/linkStore';

/** 비교용 — 대소문자·공백·하이픈·밑줄 무시 */
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s_-]+/g, '');

export default function NotFoundPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { boards, loaded: boardsLoaded } = useBoards();
  const { map: secMap, loaded: secLoaded } = useSections();
  const { links } = useCustomLinks();

  // 한 단어 주소만 (예: /LOG2) — 더 깊은 주소는 진짜로 없는 페이지다
  const word = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    try { return norm(decodeURIComponent(parts[0])); } catch { return norm(parts[0]); }
  }, [pathname]);

  const target = useMemo(() => {
    if (!word) return null;
    // 이 주소를 건 커스텀 링크의 이름도 후보로 — 「이야기」 링크가 /LOG2를 가리키고 게시판 이름이 「이야기」인 경우
    const keys = new Set([word]);
    for (const l of links) {
      if (norm(l.href.replace(/^\//, '')) === word && l.name.trim()) keys.add(norm(l.name));
    }
    const hit = (...vals: (string | undefined)[]) => vals.some(v => !!v && keys.has(norm(v)));
    for (const b of boards) {
      if (hit(b.id, b.name)) return boardHref(b.id);
    }
    for (const kind of SECTION_KINDS) {
      for (const s of sectionsOf(secMap, kind)) {
        if (s.id === MAIN_SEC) continue;
        if (hit(s.id, s.slug, s.name)) return sectionHref(kind, s.id);
      }
    }
    return null;
  }, [word, boards, secMap, links]);

  const ready = boardsLoaded && secLoaded;
  useEffect(() => {
    if (ready && target) router.replace(target);
  }, [ready, target, router]);

  // 찾는 중이거나 옮기는 중에는 빈 화면 — 안내가 번쩍이지 않게
  if (!ready || target) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/">NOT FOUND</PageTitle>
        <p>주소가 잘못되었거나 삭제된 페이지입니다</p>
      </div>
      <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
        <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>
          찾으시는 페이지가 없습니다.
        </p>
        {/* 관리자에게만 — 메뉴(커스텀 링크)에 걸 수 있는 게시판 주소 */}
        {isAdmin && boards.length > 1 && (
          <div style={{ fontSize: 12, color: 'var(--sub)', margin: '0 auto 18px', maxWidth: 420, textAlign: 'left', lineHeight: 1.9 }}>
            메뉴에 게시판을 걸 때는 아래 주소를 쓰거나, 메뉴 관리의 「미배치」에서 게시판을 그대로 끌어다 넣어 주세요.
            {boards.map(b => (
              <div key={b.id}><b>{b.name}</b> — <code>{boardHref(b.id)}</code></div>
            ))}
          </div>
        )}
        <button className="btn btn-dark" onClick={() => router.push('/')}>메인으로</button>
      </div>
    </section>
  );
}
