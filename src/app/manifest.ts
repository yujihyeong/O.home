import type { MetadataRoute } from 'next';
import { siteMeta } from '@/lib/siteMeta';

/** 웹앱 매니페스트 (커플홈 — 웹푸시) — 아이폰은 사파리 「홈 화면에 추가」로 설치한 웹앱에서만 푸시를 받을 수 있고,
 *  그러려면 standalone 매니페스트가 있어야 한다. 이름은 사이트 제목(환경설정)에서. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { title } = await siteMeta();
  const name = (title || 'O.HOME').replace(/ — 개인홈$/, '').trim() || 'O.HOME';
  return {
    name,
    short_name: name.slice(0, 12),
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#22272e',
    // 안드로이드 — 홈 화면에 설치한 웹앱이 공유 목록에 뜬다 (아이폰은 단축어로 같은 주소를 연다)
    share_target: {
      action: '/board/write',
      method: 'get',
      params: { title: 'title', text: 'text', url: 'url' },
    },
    icons: [
      { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
