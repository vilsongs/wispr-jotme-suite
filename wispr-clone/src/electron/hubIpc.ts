/** Canais do painel principal: estado, salvar ajustes, histórico. Aceita mensagens só da janela do painel. */

import { app, clipboard, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { HistoryStore } from "../core/history";
import { parseDictionaryText, sanitizeSettings, saveSettings, type Settings } from "../core/settings";
import { IPC, type EngineStatus, type HubSettingsInput, type HubState } from "../shared/ipc";

const MAX_COPY_CHARS = 100_000;
const MAX_TEXTAREA_CHARS = 20_000;

export interface HubContext {
  getHubWindow(): BrowserWindow | null;
  getSettings(): Settings;
  setSettings(next: Settings): void;
  settingsFile: string;
  history: HistoryStore;
  getStatus(): EngineStatus;
  modelName: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_TEXTAREA_CHARS) : "");

function loginItem(enabled?: boolean): boolean {
  // Em modo desenvolvimento o executável é o electron.exe e o app é a pasta do projeto.
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), "--hidden"];
  if (enabled !== undefined) app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args });
  return app.getLoginItemSettings({ path: process.execPath, args }).openAtLogin;
}

export function registerHubIpc(ctx: HubContext): void {
  const fromHub = (event: IpcMainInvokeEvent): boolean => event.sender === ctx.getHubWindow()?.webContents;

  const state = (): HubState => ({
    settings: ctx.getSettings(),
    history: ctx.history.list(),
    status: ctx.getStatus(),
    openAtLogin: loginItem(),
    modelName: ctx.modelName,
  });

  ipcMain.handle(IPC.hubGetState, (event) => (fromHub(event) ? state() : null));

  ipcMain.handle(IPC.hubSaveSettings, (event, input: HubSettingsInput) => {
    if (!fromHub(event) || typeof input !== "object" || input === null) return null;
    const current = ctx.getSettings();
    const candidate = sanitizeSettings({
      ...current,
      hotkey: input.hotkey,
      language: input.language,
      sounds: input.sounds,
      restoreClipboard: input.restoreClipboard,
      threads: Number(input.threads),
      dictionary: parseDictionaryText(text(input.dictionaryText)),
      vocabulary: text(input.vocabularyText).split(/\r?\n/),
    });
    ctx.setSettings(saveSettings(ctx.settingsFile, candidate));
    if (typeof input.openAtLogin === "boolean") loginItem(input.openAtLogin);
    return state();
  });

  ipcMain.handle(IPC.hubClearHistory, (event) => {
    if (!fromHub(event)) return null;
    ctx.history.clear();
    return state();
  });

  ipcMain.handle(IPC.hubCopy, async (event, value: unknown) => {
    if (!fromHub(event) || typeof value !== "string") return false;
    await clipboard.writeText(value.slice(0, MAX_COPY_CHARS));
    return true;
  });
}

export function notifyHub(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.webContents.send(IPC.hubChanged);
}
