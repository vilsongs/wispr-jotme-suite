/** Ponte com a user32.dll via koffi: estado das teclas e injeção de teclas (SendInput). */

import koffi from "koffi";
import { VK } from "../core/hotkeyPresets";

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x2;
const VK_V = 0x56;
const PRESSED_BIT = 0x8000;
// Ctrl, Alt, Shift e Win físicos: se algum estiver preso, Ctrl+V vira outro atalho (ex.: Win+V).
const MODIFIERS = [0xa0, 0xa1, VK.LCONTROL, VK.RCONTROL, 0xa4, 0xa5, VK.LWIN, VK.RWIN];

const user32 = koffi.load("user32.dll");

const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
  dx: "long",
  dy: "long",
  mouseData: "uint32_t",
  dwFlags: "uint32_t",
  time: "uint32_t",
  dwExtraInfo: "uintptr_t",
});
const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
  wVk: "uint16_t",
  wScan: "uint16_t",
  dwFlags: "uint32_t",
  time: "uint32_t",
  dwExtraInfo: "uintptr_t",
});
const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
  uMsg: "uint32_t",
  wParamL: "uint16_t",
  wParamH: "uint16_t",
});
const INPUT = koffi.struct("INPUT", {
  type: "uint32_t",
  u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
});

const GetAsyncKeyState = user32.func("short __stdcall GetAsyncKeyState(int vKey)");
const SendInput = user32.func("unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)");

export function isKeyDown(vk: number): boolean {
  return (GetAsyncKeyState(vk) & PRESSED_BIT) !== 0;
}

type KeyStroke = readonly [vk: number, down: boolean];

function sendKeys(strokes: readonly KeyStroke[]): void {
  const events = strokes.map(([vk, down]) => ({
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: vk, wScan: 0, dwFlags: down ? 0 : KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } },
  }));
  const sent = SendInput(events.length, events, koffi.sizeof(INPUT));
  if (sent !== events.length) {
    throw new Error("O Windows bloqueou o envio de teclas (o app de destino pode estar rodando como administrador).");
  }
}

export function sendPasteShortcut(): void {
  sendKeys([
    [VK.CONTROL, true],
    [VK_V, true],
    [VK_V, false],
    [VK.CONTROL, false],
  ]);
}

/** Impede que soltar a tecla Win abra o Menu Iniciar (técnica da "tecla máscara"). */
export function sendMaskKey(): void {
  sendKeys([
    [VK.MASK, true],
    [VK.MASK, false],
  ]);
}

export function modifiersReleased(): boolean {
  return !MODIFIERS.some(isKeyDown);
}
