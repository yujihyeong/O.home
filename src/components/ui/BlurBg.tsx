'use client';
// 위젯 배경 이미지 — 꽉 채우기(cover) + 밝기 + 부드러운 블러.
// 블러는 캔버스에 직접 건다 — CSS blur는 가장자리가 비쳐서 그걸 가리려면 이미지를 키워야 했다.
// 부모(position:relative)를 가득 채우고, 크기가 바뀌면 다시 그린다.
import React, { useEffect, useRef } from 'react';
import { gaussBlur } from '@/lib/blur';

export function BlurBg({ src, blur = 0, bright = 100 }: { src: string; blur?: number; bright?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const box = cv?.parentElement;
    if (!cv || !box) return;
    let alive = true;
    let im: HTMLImageElement | null = null;

    const draw = () => {
      if (!alive || !im) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(box.clientWidth * dpr)), h = Math.max(1, Math.round(box.clientHeight * dpr));
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d')!;
      const k = Math.max(w / im.width, h / im.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, (w - im.width * k) / 2, (h - im.height * k) / 2, im.width * k, im.height * k);
      cv.style.filter = '';
      if (blur > 0) {
        try {
          const data = ctx.getImageData(0, 0, w, h);
          gaussBlur(data, blur * dpr);
          ctx.putImageData(data, 0, 0);
        } catch {
          // 다른 주소의 이미지라 픽셀을 못 읽으면 CSS 블러로 대신
          cv.style.filter = `blur(${blur}px)`;
        }
      }
    };

    // 다른 주소(저장소)의 이미지는 CORS로 먼저 — 안 되면 그냥 불러와 CSS 블러로
    const load = (cors: boolean) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => { im = img; draw(); };
      img.onerror = () => { if (cors) load(false); };
      img.src = src;
    };
    load(/^https?:/.test(src));
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => { alive = false; ro.disconnect(); };
  }, [src, blur]);

  // 밝기 — 어둡게는 검정, 밝게는 흰색을 덮는다 (발췌 카드와 같은 방식)
  const shade = bright < 100 ? `rgba(0,0,0,${(100 - bright) / 100})`
    : bright > 100 ? `rgba(255,255,255,${((bright - 100) / 100) * 0.8})` : undefined;
  return (
    <>
      <canvas ref={ref} className="blur-bg" aria-hidden />
      {shade && <div className="blur-bg" aria-hidden style={{ background: shade }} />}
    </>
  );
}
