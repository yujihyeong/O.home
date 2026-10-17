'use client';
// 홈 배경 밝기 감지 (사용자 요청) — 위젯 배경을 끄면 글씨가 홈 배경에 묻히던 문제.
// 지금 보이는 페이지 배경(배경 이미지 > 낮/밤 장면 > 테마 그라데이션)이 밝은지 어두운지 재서
// <html data-bgtone="light|dark">로 알려 준다. CSS가 이걸 보고 배경 없는 위젯의 글씨색을 바꾼다.
import { useEffect } from 'react';

/** '#rrggbb' · 'rgb(…)' → 0~1 상대 휘도 (못 읽으면 null) */
function lum(c: string): number | null {
  const s = c.trim();
  let r: number, g: number, b: number;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, x => x + x) : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) return null;
    [r, g, b] = [+m[1], +m[2], +m[3]];
  }
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const avg = (a: (number | null)[]) => {
  const v = a.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** 배경 이미지 평균 휘도 — 작게 줄여 픽셀 평균. 다른 사이트 그림이라 못 읽으면 null */
function imageLum(url: string): Promise<number | null> {
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 24;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(im, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += lum(`rgb(${d[i]},${d[i + 1]},${d[i + 2]})`)!;
        res(s / (d.length / 4));
      } catch { res(null); }
    };
    im.onerror = () => res(null);
    im.src = url;
  });
}

async function measure(): Promise<number | null> {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  // 1) 배경 이미지가 있으면 그게 화면을 덮는다
  const img = cs.getPropertyValue('--bg-image').trim().match(/url\(["']?(.+?)["']?\)/);
  if (img) {
    const l = await imageLum(img[1]);
    if (l != null) return l;
  }
  // 2) 낮/밤 장면 레이어 — 보이는 쪽의 그라데이션 두 색
  const sc = root.dataset.scene;
  if (sc) {
    const el = document.querySelector<HTMLElement>(`.scene-${sc}`);
    if (el) {
      const s = getComputedStyle(el);
      const l = avg([lum(s.getPropertyValue('--sc-g1')), lum(s.getPropertyValue('--sc-g2'))]);
      if (l != null) return l;
    }
  }
  // 3) 테마 그라데이션
  return avg([lum(cs.getPropertyValue('--bg-g1')), lum(cs.getPropertyValue('--bg-g2'))]);
}

export function BgTone() {
  useEffect(() => {
    const root = document.documentElement;
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const my = ++seq;
      void measure().then(l => {
        if (my !== seq || l == null) return;
        // 흰 글씨와 검은 글씨의 대비가 같아지는 휘도(≈0.18) 근처가 경계 — 그보다 어두우면 밝은 글씨
        const tone = l < 0.2 ? 'dark' : 'light';
        if (root.dataset.bgtone !== tone) root.dataset.bgtone = tone;
      });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
    run();
    // 테마 바꾸기·낮밤 전환·배경 이미지 변경은 모두 <html>의 style·data-scene을 건드린다
    const mo = new MutationObserver(muts => {
      if (muts.some(m => m.attributeName !== 'data-bgtone')) later();
    });
    mo.observe(root, { attributes: true, attributeFilter: ['style', 'data-scene', 'class'] });
    return () => { mo.disconnect(); clearTimeout(timer); };
  }, []);
  return null;
}
