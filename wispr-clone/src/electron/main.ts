/** Processo principal: bandeja, janelas, atalho global, Whisper local e o fluxo de ditado. */

import { app, BrowserWindow, ipcMain, Menu, session, Tray } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DictationController, type OverlayPhase, type SoundKind } from "../core/dictation";
import { HistoryStore } from "../core/history";
import { HotkeyWatcher } from "../core/hotkeyWatcher";
import { pasteText } from "../core/paste";
import { RpcClient } from "../core/rpc";
import { loadSettings, type Settings } from "../core/settings";
import { audioContextFor, SAMPLE_RATE } from "../core/wav";
import { buildPrompt, transcribe } from "../core/whisperClient";
import { IPC, type EngineStatus, type OverlayMessage, type RecorderCommand } from "../shared/ipc";
import { createClipboardPort } from "./clipboardPort";
import { notifyHub, registerHubIpc } from "./hubIpc";
import { createLogger } from "./logger";
import { drawTrayIcon, ICON_COLORS } from "./trayIcon";
import { isKeyDown, modifiersReleased, sendMaskKey, sendPasteShortcut } from "./win32";
import { WhisperProcess } from "./whisperProcess";
import { createHubWindow, createOverlayWindow, createRecorderWindow, showOverlayNearCursor } from "./windows";

const MODEL_FILE = "ggml-large-v3-turbo-q5_0.bin";
const MAX_RECORDING_MS = 6 * 60_000;
const RECORDER_TIMEOUT_MS = 8_000;
const ERROR_OVERLAY_MS = 3_500;
const RECORDER_RESPAWN_DELAY_MS = 1_000;
const RESTORE_DELAY_MS = 250;
const RELEASE_TIMEOUT_MS = 2_000;
// Medido: ~0,25 s de CPU por segundo de fala. Folga generosa para máquina ocupada.
const TRANSCRIBE_BASE_TIMEOUT_MS = 30_000;
const TRANSCRIBE_MS_PER_SECOND = 2_000;
const HOTKEY_LABELS: Record<Settings["hotkey"], string> = { "ctrl+win": "Ctrl + Win", rctrl: "Ctrl direito" };

/** --dry-run: tudo funciona, mas o texto vai só para o log em vez de ser colado (para testes). */
const DRY_RUN = process.argv.includes("--dry-run");

/** --hidden: aberto pelo login do Windows; fica só na bandeja, sem abrir o painel. */
const START_HIDDEN = process.argv.includes("--hidden");

if (!app.requestSingleInstanceLock()) {
  // Já existe uma instância: sai antes de criar bandeja, atalho ou servidor duplicados.
  app.quit();
  process.exit(0);
}

const userData = app.getPath("userData");
const log = createLogger(join(userData, "logs", "wispr-clone.log"));
const settingsFile = join(userData, "settings.json");
const whisperDir = join(app.getAppPath(), "whisper");

let settings = loadSettings(settingsFile);
let status: EngineStatus = { kind: "loading" };
let tray: Tray | null = null;
let hubWin: BrowserWindow | null = null;
let recorderWin: BrowserWindow;
let recorderReady: Promise<void> = Promise.resolve();
let overlayWin: BrowserWindow;
let overlayTimer: NodeJS.Timeout | null = null;

const history = new HistoryStore(join(userData, "history.json"));
const whisper = new WhisperProcess({
  binDir: join(whisperDir, "bin"),
  modelPath: join(whisperDir, "models", MODEL_FILE),
  threads: settings.threads,
  pidFile: join(userData, "whisper-server.pid"),
  log,
});
const recorderRpc = new RpcClient((req) => recorderWin?.webContents.send(IPC.recorderCmd, req), RECORDER_TIMEOUT_MS);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function setStatus(next: EngineStatus): void {
  status = next;
  if (tray) {
    const tip = next.kind === "ready" ? `Wispr Clone — segure ${HOTKEY_LABELS[settings.hotkey]} para ditar` : next.kind === "loading" ? "Wispr Clone — carregando modelo…" : `Wispr Clone — erro: ${next.message}`;
    tray.setToolTip(tip.slice(0, 127));
    tray.setImage(drawTrayIcon(ICON_COLORS[next.kind]));
  }
  notifyHub(hubWin);
}

function showOverlay(phase: OverlayPhase, message?: string): void {
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = null;
  if (phase === "hidden") {
    overlayWin.hide();
    return;
  }
  const msg: OverlayMessage = { phase, message, hotkeyLabel: HOTKEY_LABELS[settings.hotkey] };
  overlayWin.webContents.send(IPC.overlayState, msg);
  showOverlayNearCursor(overlayWin);
  if (phase === "error") overlayTimer = setTimeout(() => overlayWin.hide(), ERROR_OVERLAY_MS);
}

const clipboardPort = createClipboardPort((message, err) => log("warn", message, err));

const watcher = new HotkeyWatcher({
  isDown: isKeyDown,
  sendMaskKey: () => {
    try {
      sendMaskKey();
    } catch (err) {
      log("warn", "Falha ao enviar a tecla máscara.", err);
    }
  },
  onEvent: (event) => {
    log("info", `Atalho: ${event}`);
    controller.handle(event).catch((err: unknown) => log("error", `Falha inesperada ao tratar "${event}".`, err));
  },
  getPreset: () => settings.hotkey,
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
});

const controller = new DictationController({
  recorder: {
    start: async () => {
      await recorderReady;
      return recorderRpc.call<void>("start" satisfies RecorderCommand);
    },
    stop: async () => {
      const data = await recorderRpc.call<Float32Array | ArrayBuffer>("stop" satisfies RecorderCommand);
      return data instanceof Float32Array ? data : new Float32Array(data);
    },
    cancel: () => recorderRpc.call<void>("cancel" satisfies RecorderCommand),
  },
  transcribe: async (wav, durationSec) => {
    await whisper.ensureReady();
    return transcribe(whisper.baseUrl, wav, {
      language: settings.language,
      prompt: buildPrompt(settings.vocabulary),
      audioCtx: audioContextFor(durationSec),
      timeoutMs: TRANSCRIBE_BASE_TIMEOUT_MS + durationSec * TRANSCRIBE_MS_PER_SECOND,
    });
  },
  paste: async (text) => {
    if (DRY_RUN) return log("info", `[dry-run] colaria: "${text}"`);
    return pasteText(text, {
      clipboard: clipboardPort,
      sendPasteShortcut,
      onPasted: () => showOverlay("hidden"),
      modifiersReleased,
      sleep,
      restoreClipboard: settings.restoreClipboard,
      restoreDelayMs: RESTORE_DELAY_MS,
      releaseTimeoutMs: RELEASE_TIMEOUT_MS,
    });
  },
  showOverlay,
  playSound: (kind: SoundKind) => {
    if (settings.sounds) recorderWin.webContents.send(IPC.recorderSound, kind);
  },
  addHistory: (entry) => {
    history.add(entry);
    log("info", `Ditado: ${entry.durationMs} ms de fala, transcrito em ${entry.transcribeMs} ms.`);
    notifyHub(hubWin);
  },
  getDictionary: () => settings.dictionary,
  resetHotkey: () => watcher.reset(),
  now: () => Date.now(),
  log,
  newId: () => randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
  sampleRate: SAMPLE_RATE,
  maxRecordingMs: MAX_RECORDING_MS,
});

function openHub(): void {
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.show();
    hubWin.focus();
    return;
  }
  hubWin = createHubWindow();
  hubWin.on("closed", () => (hubWin = null));
}

function createTray(): void {
  tray = new Tray(drawTrayIcon(ICON_COLORS.loading));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir painel", click: openHub },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]),
  );
  tray.on("click", openHub);
}

function spawnRecorder(): void {
  recorderWin = createRecorderWindow();
  // Comandos enviados antes do carregamento da página se perderiam.
  recorderReady = new Promise((resolve) => recorderWin.webContents.once("did-finish-load", () => resolve()));
  const win = recorderWin;
  win.webContents.on("render-process-gone", (_e, details) => {
    log("error", `Janela do gravador caiu (${details.reason}); recriando.`);
    recorderRpc.dispose("A janela do gravador foi reiniciada.");
    if (!win.isDestroyed()) win.destroy();
    setTimeout(spawnRecorder, RECORDER_RESPAWN_DELAY_MS); // evita laço de recriação instantânea
  });
}

function wireRecorderIpc(): void {
  ipcMain.on(IPC.recorderReply, (event, reply: unknown) => {
    if (event.sender === recorderWin.webContents) recorderRpc.handleReply(reply);
  });
  ipcMain.on(IPC.recorderLevel, (event, level: unknown) => {
    if (event.sender === recorderWin.webContents && typeof level === "number") overlayWin.webContents.send(IPC.overlayLevel, level);
  });
}

/** Microfone só para a janela do gravador, e só áudio; todo o resto é negado. */
function allowMicrophoneOnly(): void {
  const ses = session.defaultSession;
  const isRecorder = (wc: Electron.WebContents | null) => wc !== null && !recorderWin.isDestroyed() && wc === recorderWin.webContents;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = "mediaTypes" in details && (details.mediaTypes ?? []).every((t) => t === "audio");
    callback(permission === "media" && audioOnly && isRecorder(wc));
  });
  ses.setPermissionCheckHandler((wc, permission) => permission === "media" && isRecorder(wc));
}

async function bootWhisper(): Promise<void> {
  setStatus({ kind: "loading" });
  try {
    await whisper.ensureReady();
    setStatus({ kind: "ready" });
  } catch (err) {
    log("error", "Não foi possível iniciar o Whisper.", err);
    setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

app.on("second-instance", openHub);
app.on("window-all-closed", () => {
  // continua rodando na bandeja
});
app.on("before-quit", () => {
  watcher.stop();
  whisper.stop();
});

void app.whenReady().then(() => {
  app.setAppUserModelId("local.wispr-clone");
  log("info", `Iniciando Wispr Clone ${app.getVersion()} (Electron ${process.versions.electron})${DRY_RUN ? " em modo dry-run" : ""}.`);
  Menu.setApplicationMenu(null); // sem menu (e sem atalho para DevTools)
  spawnRecorder();
  allowMicrophoneOnly();
  overlayWin = createOverlayWindow();
  wireRecorderIpc();
  createTray();
  registerHubIpc({
    getHubWindow: () => hubWin,
    getSettings: () => settings,
    setSettings: (next) => {
      settings = next;
      setStatus(status); // atualiza o atalho mostrado na bandeja
    },
    settingsFile,
    history,
    getStatus: () => status,
    modelName: MODEL_FILE,
  });
  watcher.start();
  if (!START_HIDDEN) openHub();
  void bootWhisper();
});
