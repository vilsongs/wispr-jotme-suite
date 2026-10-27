/** Teclas de cada atalho e leitura do teclado em um "retrato" para a máquina de estados. */

import type { HotkeyPreset } from "./settings";

// Códigos de tecla virtuais do Windows (VK_*).
export const VK = Object.freeze({
  CONTROL: 0x11,
  ESCAPE: 0x1b,
  LWIN: 0x5b,
  RWIN: 0x5c,
  LCONTROL: 0xa2,
  RCONTROL: 0xa3,
  /** Código sem uso, injetado para impedir que o Win solto abra o Menu Iniciar. */
  MASK: 0xe8,
});

interface PresetDef {
  /** Cada grupo precisa de pelo menos uma tecla pressionada (ex.: Ctrl esquerdo OU direito). */
  groups: readonly (readonly number[])[];
  /** Teclas que não contam como "outra tecla" (inclui o código genérico VK_CONTROL). */
  own: readonly number[];
  usesWin: boolean;
}

export const PRESETS: Readonly<Record<HotkeyPreset, PresetDef>> = Object.freeze({
  "ctrl+win": {
    groups: [
      [VK.LCONTROL, VK.RCONTROL],
      [VK.LWIN, VK.RWIN],
    ],
    own: [VK.CONTROL, VK.LCONTROL, VK.RCONTROL, VK.LWIN, VK.RWIN],
    usesWin: true,
  },
  rctrl: {
    groups: [[VK.RCONTROL]],
    own: [VK.CONTROL, VK.RCONTROL],
    usesWin: false,
  },
});

// 0x01–0x06 são botões do mouse; 0xE7 é VK_PACKET (texto injetado).
const SCAN_FROM = 0x08;
const SCAN_TO = 0xfe;
const IGNORED = new Set<number>([VK.MASK, 0xe7]);

export interface KeyFlags {
  combo: boolean;
  escape: boolean;
  otherKey: boolean;
}

export function evaluateKeys(preset: HotkeyPreset, isDown: (vk: number) => boolean, scanOthers: boolean): KeyFlags {
  const def = PRESETS[preset];
  const combo = def.groups.every((group) => group.some(isDown));
  const escape = isDown(VK.ESCAPE);
  let otherKey = false;
  if (scanOthers) {
    for (let vk = SCAN_FROM; vk <= SCAN_TO && !otherKey; vk++) {
      if (!def.own.includes(vk) && !IGNORED.has(vk) && isDown(vk)) otherKey = true;
    }
  }
  return { combo, escape, otherKey };
}
