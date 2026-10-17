// 부드러운 블러 — 캔버스 이미지에 직접 건다 (CSS blur처럼 가장자리가 비치거나, 그걸 가리려 확대할 필요가 없다)
/** 상자 블러를 가로·세로로 3번 — 가우스 블러와 거의 같은 부드러운 흐림 (모든 브라우저에서 똑같이) */
export function gaussBlur(img: ImageData, sigma: number) {
  const { width: w, height: h, data } = img;
  // 표준편차 sigma에 맞는 상자 3개 크기 (Kovesi 방식)
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii = [0, 1, 2].map(i => ((i < m ? wl : wl + 2) - 1) / 2);
  const a = new Float32Array(w * h * 3), b = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { a[j] = data[i]; a[j + 1] = data[i + 1]; a[j + 2] = data[i + 2]; }
  const pass = (src: Float32Array, dst: Float32Array, r: number, horiz: boolean) => {
    if (r < 1) { dst.set(src); return; }
    const len = horiz ? w : h, lines = horiz ? h : w;
    const step = (horiz ? 1 : w) * 3, iarr = 1 / (r + r + 1);
    for (let line = 0; line < lines; line++) {
      const base = (horiz ? line * w : line) * 3;
      for (let c = 0; c < 3; c++) {
        const at = (k: number) => src[base + Math.min(len - 1, Math.max(0, k)) * step + c];   // 가장자리는 끝 픽셀
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += at(k);
        for (let k = 0; k < len; k++) {
          dst[base + k * step + c] = acc * iarr;
          acc += at(k + r + 1) - at(k - r);
        }
      }
    }
  };
  for (const r of radii) { pass(a, b, Math.round(r), true); pass(b, a, Math.round(r), false); }
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { data[i] = a[j]; data[i + 1] = a[j + 1]; data[i + 2] = a[j + 2]; data[i + 3] = 255; }
}
