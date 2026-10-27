/** Gera em memória o ícone de 16x16 da bandeja do sistema (BGRA para Windows). */

import { nativeImage, type NativeImage } from "electron";

export const ICON_COLORS = {
  loading: [217, 155, 38] as const, // âmbar
  ready: [34, 160, 107] as const, // verde
  recording: [229, 72, 77] as const, // vermelho (gravando reunião)
  error: [180, 60, 60] as const,
};

export function drawTrayIcon([r, g, b]: readonly [number, number, number]): NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 7.5;
  const cy = 7.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > 6.8) continue;
      const alpha = dist > 5.8 ? Math.round((6.8 - dist) * 255) : 255;
      const idx = (y * size + x) * 4;
      buf[idx] = b;
      buf[idx + 1] = g;
      buf[idx + 2] = r;
      buf[idx + 3] = alpha;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}
