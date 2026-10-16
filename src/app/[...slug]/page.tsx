'use client';
// 없는 주소 안내 (v1.9) — 개발 마일스톤 문구 제거, 일반 방문자용 안내만
//
// 짧은 주소로 찾아가기 (사용자 제보 — 커스텀 링크에 `/LOG`, `/OOC2`처럼 직접 지은 주소를 적었더니
// 그런 페이지가 없어 「주소가 잘못되었거나」가 떴다. 게시판 주소는 원래 `/board?b=<id>`).
//  ① 관리자가 연결해 둔 곳(aliasStore)이 있으면 그곳
//  ② 없으면 게시판·섹션의 이름·별명·id(또는 그 주소를 건 커스텀 링크의 이름)가 같은 곳
//  ③ 그래도 없으면 안내 — 관리자에게는 「이 주소를 어디로 연결할지」 고르는 칸을 보여 준다
// 찾으면 **주소창은 내가 정한 주소(/LOG) 그대로** 두고 그 자리에서 연결된 페이지를 그린다 (사용자 요청)
import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { PageTitle } from '@/components/ui/PageText';
import { KSelect } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { useBoards, boardHref } from '@/lib/boardStore';
import { useSections, SECTION_KINDS, SECTION_META, sectionsOf, sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useCustomLinks } from '@/lib/linkStore';
import { useAliases, aliasKey } from '@/lib/aliasStore';
import { FEATURES } from '@/lib/menu';
import { RouteSearchProvider } from '@/lib/routeParams';
import { useHrefBlock } from '@/components/shell/MenuGuard';

/* 짧은 주소 자리에 그릴 수 있는 페이지 — 실제 주소의 앞부분 → 그 페이지 */
const blank = () => <section className="page" />;
const PAGES: Record<string, React.ComponentType> = {
  '/board': dynamic(() => import('../board/page'), { loading: blank }),
  '/gallery': dynamic(() => import('../gallery/page'), { loading: blank }),
  '/loadb': dynamic(() => import('../loadb/page'), { loading: blank }),
  '/trpg': dynamic(() => import('../trpg/page'), { loading: blank }),
  '/dotori': dynamic(() => import('../dotori/page'), { loading: blank }),
  '/playlog': dynamic(() => import('../playlog/page'), { loading: blank }),
  '/comm': dynamic(() => import('../comm/page'), { loading: blank }),
  '/comm-apply': dynamic(() => import('../comm-apply/page'), { loading: blank }),
  '/diary': dynamic(() => import('../diary/page'), { loading: blank }),
  '/threads': dynamic(() => import('../threads/page'), { loading: blank }),
  '/cal': dynamic(() => import('../cal/page'), { loading: blank }),
  '/chars': dynamic(() => import('../chars/page'), { loading: blank }),
  '/rels': dynamic(() => import('../rels/page'), { loading: blank }),
  '/rp': dynamic(() => import('../rp/page'), { loading: blank }),
  '/tchars': dynamic(() => import('../tchars/page'), { loading: blank }),
  '/memo': dynamic(() => import('../memo/page'), { loading: blank }),
  '/guest': dynamic(() => import('../guest/page'), { loading: blank }),
  '/intro': dynamic(() => import('../intro/page'), { loading: blank }),
};

const norm = aliasKey;

export default function NotFoundPage() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { boards, loaded: boardsLoaded } = useBoards();
  const { map: secMap, loaded: secLoaded } = useSections();
  const { links } = useCustomLinks();
  const [aliases, setAlias] = useAliases();
  const [pick, setPick] = useState('');

  // 한 단어 주소만 (예: /LOG2) — 더 깊은 주소는 진짜로 없는 페이지다
  const raw = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    try { return decodeURIComponent(parts[0]); } catch { return parts[0]; }
  }, [pathname]);
  const word = raw === null ? null : norm(raw);

  // 연결할 수 있는 곳 — 게시판 · 여러 개로 만든 섹션 · 기본 기능 페이지
  const targets = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const b of boards) out.push({ value: boardHref(b.id), label: `게시판 · ${b.name}` });
    for (const kind of SECTION_KINDS) {
      for (const s of sectionsOf(secMap, kind)) {
        if (s.id === MAIN_SEC) continue;
        out.push({ value: sectionHref(kind, s.id), label: `${SECTION_META[kind].label} · ${s.name}` });
      }
    }
    for (const f of FEATURES) {
      if (f.href !== '/board') out.push({ value: f.href, label: `기본 · ${f.label} (${f.href})` });
    }
    return out;
  }, [boards, secMap]);

  const target = useMemo(() => {
    if (!word) return null;
    if (aliases[word]) return aliases[word];
    // 이 주소를 건 커스텀 링크의 이름도 후보로 — 「이야기」 링크가 /LOG2를 가리키고 게시판 이름이 「이야기」인 경우
    const keys = new Set([word]);
    for (const l of links) {
      if (norm(l.href) === word && l.name.trim()) keys.add(norm(l.name));
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
  }, [word, boards, secMap, links, aliases]);

  const ready = boardsLoaded && secLoaded;
  // 연결된 페이지 — 앞부분(경로)과 쿼리로 나눈다
  const tPath = target ? target.split(/[?#]/)[0] : '';
  const tSearch = target && target.includes('?') ? target.slice(target.indexOf('?') + 1).split('#')[0] : '';
  const Page = target ? PAGES[tPath] : undefined;
  // 연결된 곳이 비공개 메뉴면 짧은 주소로도 열리지 않게 — 원래 주소와 같은 기준 (훅이라 항상 부른다)
  const blocked = useHrefBlock(ready && Page ? target ?? undefined : undefined);
  // 그 자리에 그릴 수 없는 곳(상세 페이지 등)은 예전처럼 옮겨 간다
  useEffect(() => {
    if (ready && target && !PAGES[target.split(/[?#]/)[0]]) router.replace(target);
  }, [ready, target, router]);

  // 찾는 중에는 빈 화면 — 안내가 번쩍이지 않게
  if (!ready) return <section className="page" />;
  if (target && Page) {
    if (blocked) return blocked;
    return <RouteSearchProvider search={tSearch}><Page /></RouteSearchProvider>;
  }
  if (target) return <section className="page" />;   // 위 effect가 옮겨 간다

  const linkName = links.find(l => word && norm(l.href) === word)?.name;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/">NOT FOUND</PageTitle>
        <p>주소가 잘못되었거나 삭제된 페이지입니다</p>
      </div>
      <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
        {/* 관리자 — 이 주소를 어디로 연결할지 바로 고른다 */}
        {isAdmin && raw ? (
          <div style={{ maxWidth: 460, margin: '0 auto 22px', textAlign: 'left', display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.7 }}>
              <b>/{raw}</b>{linkName ? <> (메뉴 「{linkName}」)</> : null}는 아직 아무 페이지에도 연결되지 않았어요.
              <br />어디로 보낼지 고르면 이제부터 이 주소로 들어오는 사람은 그곳으로 가요.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <KSelect minWidth={240} maxWidth={320} value={pick} onChange={setPick}
                placeholder="연결할 곳 고르기" options={targets} />
              <button className="btn btn-dark" disabled={!pick} style={{ opacity: pick ? 1 : 0.45 }}
                onClick={() => {
                  if (!pick) return;
                  setAlias(raw, pick);
                  toast(`/${raw} 주소를 연결했어요`);   // 이 화면이 그대로 그 페이지로 바뀐다
                }}>연결</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>
            찾으시는 페이지가 없습니다.
          </p>
        )}
        <button className="btn btn-ghost" onClick={() => router.push('/')}>메인으로</button>
      </div>
    </section>
  );
}
