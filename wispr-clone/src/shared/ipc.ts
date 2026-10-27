/** Nomes de canais IPC e formatos de mensagem compartilhados entre main, preloads e telas. */

import type { HistoryEntry } from "../core/history";
import type { OverlayPhase, SoundKind } from "../core/dictation";
import type { Settings } from "../core/settings";

export const IPC = {
  recorderCmd: "recorder:cmd",
  recorderReply: "recorder:reply",
  recorderLevel: "recorder:level",
  recorderSound: "recorder:sound",
  overlayState: "overlay:state",
  overlayLevel: "overlay:level",
  hubGetState: "hub:get-state",
  hubSaveSettings: "hub:save-settings",
  hubClearHistory: "hub:clear-history",
  hubCopy: "hub:copy",
  hubChanged: "hub:changed",
} as const;

export type RecorderCommand = "start" | "stop" | "cancel";

export interface OverlayMessage {
  phase: OverlayPhase;
  message?: string;
  hotkeyLabel: string;
}

export type EngineStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export interface HubState {
  settings: Settings;
  history: HistoryEntry[];
  status: EngineStatus;
  openAtLogin: boolean;
  modelName: string;
}

/** O que a tela de ajustes envia; o main valida tudo antes de salvar. */
export interface HubSettingsInput {
  hotkey: unknown;
  language: unknown;
  sounds: unknown;
  restoreClipboard: unknown;
  threads: unknown;
  dictionaryText: unknown;
  vocabularyText: unknown;
  openAtLogin: unknown;
}

export type { SoundKind };
