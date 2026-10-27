/** Ícone da bandeja desenhado em código (sem arquivos de imagem): microfone sobre um círculo. */

import { nativeImage, type NativeImage } from "electron";

const SIZE = 32;

type Rgb = readonly [number, number, number];
export const ICON_COLORS: Readonly<Record<"ready" | "loading" | "error", Rgb>> = Object.freeze({
  ready: [232, 93, 63],
  loading: [140, 140, 140],
  error: [196, 48, 48],
});

function insideMic(x: number, y: number): boolean {
  const cx = 15.5;
  // cápsula do microfone
  const inCapsule = Math.abs(x - cx) <= 4 && y >= 7 && y <= 18 && (y >= 11 || (x - cx) ** 2 + (y - 11) ** 2 <= 16);
  const inCapsuleBottom = (x - cx) ** 2 + (y - 18) ** 2 <= 16 && y >= 18;
  // arco do suporte
  const d = Math.sqrt((x - cx) ** 2 + (y - 16) ** 2);
  const inArc = y >= 16 && d >= 6.2 && d <= 7.8;
  // haste e base
  const inStem = Math.abs(x - cx) <= 1 && y >= 23 && y <= 26;
  const inBase = Math.abs(x - cx) <= 4 && y >= 25.5 && y <= 27;
  return inCapsule || inCapsuleBottom || inArc || inStem || inBase;
}

export function drawTrayIcon(color: Rgb): NativeImage {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const [r, g, b] = color;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const inCircle = (x - 15.5) ** 2 + (y - 15.5) ** 2 <= 15.5 ** 2;
      if (!inCircle) continue;
      const white = insideMic(x, y);
      // Formato BGRA
      buf[i] = white ? 255 : b;
      buf[i + 1] = white ? 255 : g;
      buf[i + 2] = white ? 255 : r;
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE });
}
