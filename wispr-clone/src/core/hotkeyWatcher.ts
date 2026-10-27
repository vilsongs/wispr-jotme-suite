/** Consulta periódica do teclado que alimenta a máquina de estados do atalho. */

import { evaluateKeys, PRESETS } from "./hotkeyPresets";
import { initialHotkeyState, stepHotkey, type HotkeyEvent, type HotkeyState } from "./hotkeyMachine";
import type { HotkeyPreset } from "./settings";

export const POLL_INTERVAL_MS = 15;

export interface HotkeyWatcherDeps {
  isDown(vk: number): boolean;
  sendMaskKey(): void;
  onEvent(event: HotkeyEvent): void;
  getPreset(): HotkeyPreset;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export class HotkeyWatcher {
  private state: HotkeyState = initialHotkeyState();
  private handle: unknown = null;

  constructor(private readonly deps: HotkeyWatcherDeps) {}

  start(): void {
    if (this.handle !== null) return;
    this.handle = this.deps.setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.handle === null) return;
    this.deps.clearInterval(this.handle);
    this.handle = null;
  }

  /** Volta para "ocioso", esperando o atalho ser solto antes de aceitar um novo início. */
  reset(): void {
    this.state = { phase: "awaitRelease", pressedAt: 0 };
  }

  private tick(): void {
    const preset = this.deps.getPreset();
    // A varredura das ~240 teclas só é necessária enquanto o atalho está seguro.
    const flags = evaluateKeys(preset, (vk) => this.deps.isDown(vk), this.state.phase === "holding");
    const { state, events } = stepHotkey(this.state, { ...flags, now: this.deps.now() });
    this.state = state;
    for (const event of events) {
      if (event === "start" && PRESETS[preset].usesWin) this.deps.sendMaskKey();
      try {
        this.deps.onEvent(event);
      } catch {
        // um erro no ouvinte não pode derrubar a leitura do teclado
      }
    }
  }
}
