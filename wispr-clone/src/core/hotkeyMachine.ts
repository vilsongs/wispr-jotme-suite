/**
 * Máquina de estados do atalho de ditado (pura, sem efeitos colaterais).
 *
 * - Segurar o atalho grava; soltar transcreve ("push-to-talk").
 * - Um toque rápido (< TAP_MAX_MS) trava a gravação em modo mãos-livres;
 *   o próximo toque encerra.
 * - Esc cancela. Outra tecla junto com o atalho (ex.: Ctrl+Win+D) cancela
 *   em silêncio, para não sequestrar atalhos do Windows.
 */

export type HotkeyEvent = "start" | "stop" | "lock" | "cancel";
export type HotkeyPhase = "idle" | "holding" | "locked" | "awaitRelease";

export const TAP_MAX_MS = 300;

export interface KeySnapshot {
  /** Todas as teclas do atalho estão pressionadas. */
  combo: boolean;
  escape: boolean;
  /** Alguma tecla fora do atalho está pressionada. */
  otherKey: boolean;
  now: number;
}

export interface HotkeyState {
  readonly phase: HotkeyPhase;
  readonly pressedAt: number;
}

export interface HotkeyStep {
  state: HotkeyState;
  events: HotkeyEvent[];
}

export function initialHotkeyState(): HotkeyState {
  return { phase: "idle", pressedAt: 0 };
}

const to = (phase: HotkeyPhase, pressedAt: number, events: HotkeyEvent[] = []): HotkeyStep => ({
  state: { phase, pressedAt },
  events,
});

export function stepHotkey(state: HotkeyState, snap: KeySnapshot): HotkeyStep {
  switch (state.phase) {
    case "idle":
      return snap.combo ? to("holding", snap.now, ["start"]) : to("idle", 0);

    case "holding":
      if (snap.escape || snap.otherKey) return to("awaitRelease", 0, ["cancel"]);
      if (snap.combo) return to("holding", state.pressedAt);
      return snap.now - state.pressedAt < TAP_MAX_MS ? to("locked", state.pressedAt, ["lock"]) : to("idle", 0, ["stop"]);

    case "locked":
      if (snap.escape) return to("idle", 0, ["cancel"]);
      if (snap.combo) return to("awaitRelease", 0, ["stop"]);
      return to("locked", state.pressedAt);

    case "awaitRelease":
      return snap.combo ? to("awaitRelease", 0) : to("idle", 0);
  }
}
