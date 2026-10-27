/**
 * Processo principal do JotMe Clone:
 * - Configura captura WASAPI Loopback nativa do Windows (sem bot e sem VB-Cable)
 * - Sobe o whisper-server local com GPU Vulkan
 * - Coordena o gravador duplo (Microfone + Sistema), a barra flutuante e o painel de Atas
 */

import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, Menu, session, Tray } from "electron";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MeetingStore } from "../core/meetings";
import { MeetingSessionController } from "../core/meetingSession";
import { RpcClient } from "../core/rpc";
import { loadSettings, saveSettings, type CaptureMode, type Settings } from "../core/settings";
import { formatMeetingMarkdown, formatMeetingText } from "../core/summary";
import { audioContextFor, SAMPLE_RATE } from "../core/wav";
import { buildPrompt, transcribe } from "../core/whisperClient";
import { IPC, type AudioLevels, type EngineStatus, type HubState, type RecorderCommand, type RecorderSegmentPayload } from "../shared/ipc";
import { createLogger } from "./logger";
import { drawTrayIcon, ICON_COLORS } from "./trayIcon";
import { WhisperProcess } from "./whisperProcess";
import { applyStealthProtection, createHubWindow, createLiveWindow, createRecorderWindow, setLiveWindowCompact } from "./windows";

const MODEL_FILE = "ggml-large-v3-turbo-q5_0.bin";
const RECORDER_TIMEOUT_MS = 12_000;
const RECORDER_RESPAWN_DELAY_MS = 1_000;
const TRANSCRIBE_BASE_TIMEOUT_MS = 30_000;
const TRANSCRIBE_MS_PER_SECOND = 2_000;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const userData = app.getPath("userData");
const log = createLogger(join(userData, "logs", "jotme-clone.log"));
const settingsFile = join(userData, "settings.json");
const meetingsFile = join(userData, "meetings.json");
const whisperDir = join(app.getAppPath(), "whisper");

let settings = loadSettings(settingsFile);
let engineStatus: EngineStatus = { kind: "loading" };
let tray: Tray | null = null;
let hubWin: BrowserWindow | null = null;
let liveWin: BrowserWindow | null = null;
let liveCompact = true;
let recorderWin: BrowserWindow;
let recorderReady: Promise<void> = Promise.resolve();

function setLiveMode(compact: boolean): void {
  liveCompact = compact;
  setLiveWindowCompact(liveWin, compact, settings.stealthMode);
  if (liveWin && !liveWin.isDestroyed()) {
    liveWin.webContents.send(IPC.liveMode, compact);
  }
}

const meetings = new MeetingStore(meetingsFile);
const whisper = new WhisperProcess({
  binDir: join(whisperDir, "bin"),
  modelPath: join(whisperDir, "models", MODEL_FILE),
  threads: settings.threads,
  pidFile: join(userData, "whisper-server.pid"),
  log,
});
const recorderRpc = new RpcClient((req) => recorderWin?.webContents.send(IPC.recorderCmd, req), RECORDER_TIMEOUT_MS);

function getHubState(): HubState {
  return {
    engineStatus,
    modelName: MODEL_FILE,
    settings,
    session: sessionController.getSnapshot(),
    meetings: meetings.list(),
  };
}

function broadcastState(): void {
  const state = getHubState();
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.webContents.send(IPC.hubStateChanged, state);
  }
  if (liveWin && !liveWin.isDestroyed()) {
    liveWin.webContents.send(IPC.liveState, state.session);
    liveWin.webContents.send(IPC.liveMode, liveCompact);
    const active = state.session.status === "recording" || state.session.status === "paused" || state.session.status === "stopping";
    if (active && settings.showFloatingBar) {
      if (!liveWin.isVisible()) {
        setLiveWindowCompact(liveWin, liveCompact, settings.stealthMode);
        liveWin.showInactive();
        applyStealthProtection(liveWin, settings.stealthMode);
      }
    } else if (!active && liveWin.isVisible()) {
      liveWin.hide();
    }
  }
  updateTray();
}

function updateTray(): void {
  if (!tray) return;
  const sess = sessionController.getSnapshot();
  const isRec = sess.status === "recording" || sess.status === "paused";
  const colorKey = isRec ? "recording" : engineStatus.kind === "ready" ? "ready" : engineStatus.kind === "loading" ? "loading" : "error";
  tray.setImage(drawTrayIcon(ICON_COLORS[colorKey]));
  const tip = isRec
    ? `JotMe Clone — Gravando: ${sess.title}`
    : engineStatus.kind === "ready"
      ? "JotMe Clone — Pronto para transcrever reuniões"
      : engineStatus.kind === "loading"
        ? "JotMe Clone — Carregando modelo Whisper…"
        : `JotMe Clone — Erro: ${engineStatus.message}`;
  tray.setToolTip(tip.slice(0, 127));
}

const sessionController = new MeetingSessionController({
  recorder: {
    start: async (mode: CaptureMode) => {
      await recorderReady;
      return recorderRpc.call<void>("start" satisfies RecorderCommand, { mode });
    },
    pause: () => recorderRpc.call<void>("pause" satisfies RecorderCommand),
    resume: () => recorderRpc.call<void>("resume" satisfies RecorderCommand),
    stop: () => recorderRpc.call<void>("stop" satisfies RecorderCommand),
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
  saveMeeting: (record) => meetings.save(record),
  getDictionary: () => settings.dictionary,
  getCaptureMode: () => settings.captureMode,
  onStateChange: () => broadcastState(),
  now: () => Date.now(),
  newId: () => randomUUID(),
  sampleRate: SAMPLE_RATE,
  log,
});

function openHub(): void {
  if (hubWin && !hubWin.isDestroyed()) {
    hubWin.setAlwaysOnTop(true);
    hubWin.show();
    hubWin.focus();
    setTimeout(() => {
      if (hubWin && !hubWin.isDestroyed()) hubWin.setAlwaysOnTop(false);
    }, 300);
    return;
  }
  hubWin = createHubWindow(settings.stealthMode);
  hubWin.on("closed", () => (hubWin = null));
}

function createTray(): void {
  tray = new Tray(drawTrayIcon(ICON_COLORS.loading));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir JotMe Clone", click: openHub },
      { label: "Iniciar Reunião Rápida", click: () => void sessionController.start() },
      { label: "Encerrar Reunião Atual", click: () => void sessionController.stop() },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]),
  );
  tray.on("click", openHub);
}

function spawnRecorder(): void {
  recorderWin = createRecorderWindow();
  recorderReady = new Promise((resolve) => recorderWin.webContents.once("did-finish-load", () => resolve()));
  const win = recorderWin;
  win.webContents.on("render-process-gone", (_e, details) => {
    log("error", `Janela do gravador caiu (${details.reason}); recriando.`);
    recorderRpc.dispose("A janela do gravador foi reiniciada.");
    if (!win.isDestroyed()) win.destroy();
    setTimeout(spawnRecorder, RECORDER_RESPAWN_DELAY_MS);
  });
}

/**
 * Configura captura de áudio sem bot:
 * - Microfone via getUserMedia
 * - Áudio do sistema (reunião) via WASAPI Loopback nativo do Chromium/Electron
 */
function configureAudioCapturePermissions(): void {
  const ses = session.defaultSession;
  const isRecorder = (wc: Electron.WebContents | null) => wc !== null && !recorderWin.isDestroyed() && wc === recorderWin.webContents;

  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback((permission === "media" || permission === "display-capture") && isRecorder(wc));
  });
  ses.setPermissionCheckHandler((wc, permission) => (permission === "media" || permission === "display-capture") && isRecorder(wc));

  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isRecorder(request.frame?. routingId ? recorderWin.webContents : recorderWin.webContents)) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"] });
      if (sources.length === 0) {
        callback({});
        return;
      }
      callback({ video: sources[0], audio: "loopback" });
    } catch (err) {
      log("error", "Falha ao obter fonte loopback de áudio do sistema.", err);
      callback({});
    }
  });
}

function wireIpc(): void {
  ipcMain.on(IPC.recorderReply, (event, reply: unknown) => {
    if (event.sender === recorderWin.webContents) recorderRpc.handleReply(reply);
  });

  ipcMain.on(IPC.recorderSegment, (event, payload: RecorderSegmentPayload) => {
    if (event.sender !== recorderWin.webContents || !payload) return;
    const samples = payload.samples instanceof Float32Array ? payload.samples : new Float32Array(payload.samples);
    void sessionController.pushSegment(payload.speaker, samples);
  });

  ipcMain.on(IPC.recorderLevels, (event, levels: AudioLevels) => {
    if (event.sender !== recorderWin.webContents) return;
    if (hubWin && !hubWin.isDestroyed()) hubWin.webContents.send(IPC.hubLevels, levels);
    if (liveWin && !liveWin.isDestroyed() && liveWin.isVisible()) liveWin.webContents.send(IPC.liveLevels, levels);
  });

  ipcMain.on(IPC.liveAction, (_event, action: string) => {
    if (action === "pause") void sessionController.pause();
    else if (action === "resume") void sessionController.resume();
    else if (action === "stop") {
      void sessionController.stop().then(() => openHub());
    } else if (action === "open-hub") openHub();
    else if (action === "expand") setLiveMode(false);
    else if (action === "collapse" || action === "hide") {
      if (hubWin && !hubWin.isDestroyed() && hubWin.isVisible()) hubWin.hide();
      setLiveMode(true);
    }
  });

  ipcMain.handle(IPC.hubGetState, () => getHubState());
  ipcMain.handle(IPC.hubStartMeeting, async (_e, title?: string) => {
    setLiveMode(true);
    const snap = await sessionController.start(title);
    if (snap.status === "recording" && hubWin && !hubWin.isDestroyed()) {
      hubWin.hide();
    }
    return snap;
  });
  ipcMain.handle(IPC.hubPauseMeeting, () => sessionController.pause());
  ipcMain.handle(IPC.hubResumeMeeting, () => sessionController.resume());
  ipcMain.handle(IPC.hubStopMeeting, () => sessionController.stop());
  ipcMain.handle(IPC.hubUpdateLiveMeta, (_e, patch: { title?: string; notes?: string }) => {
    if (typeof patch?.title === "string") sessionController.setTitle(patch.title);
    if (typeof patch?.notes === "string") sessionController.setNotes(patch.notes);
    return sessionController.getSnapshot();
  });

  ipcMain.handle(IPC.hubSaveSettings, (_e, next: Settings) => {
    settings = saveSettings(settingsFile, next);
    applyStealthProtection(hubWin, settings.stealthMode);
    applyStealthProtection(liveWin, settings.stealthMode);
    broadcastState();
    return settings;
  });

  ipcMain.handle(IPC.hubUpdateMeeting, (_e, id: string, patch: { title?: string; notes?: string }) => {
    const updated = meetings.updateMeta(id, patch);
    broadcastState();
    return updated;
  });

  ipcMain.handle(IPC.hubDeleteMeeting, (_e, id: string) => {
    const ok = meetings.remove(id);
    broadcastState();
    return ok;
  });

  ipcMain.handle(IPC.hubCopyMeeting, (_e, id: string, format: "md" | "txt") => {
    const m = meetings.get(id);
    if (!m) return false;
    const content = format === "md" ? formatMeetingMarkdown(m) : formatMeetingText(m);
    clipboard.writeText(content);
    return true;
  });

  ipcMain.handle(IPC.hubExportMeeting, async (_e, id: string, format: "md" | "txt") => {
    const m = meetings.get(id);
    if (!m) return null;
    const ext = format === "md" ? "md" : "txt";
    const safeTitle = m.title.replace(/[<>:"/\\|?*]+/g, "-").slice(0, 60) || "reuniao";
    const res = await dialog.showSaveDialog({
      title: "Exportar Ata da Reunião",
      defaultPath: `${safeTitle}.${ext}`,
      filters: [{ name: format === "md" ? "Markdown" : "Texto", extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    const content = format === "md" ? formatMeetingMarkdown(m) : formatMeetingText(m);
    writeFileSync(res.filePath, content, "utf8");
    return res.filePath;
  });
}

async function bootWhisper(): Promise<void> {
  engineStatus = { kind: "loading" };
  broadcastState();
  try {
    await whisper.ensureReady();
    engineStatus = { kind: "ready" };
    broadcastState();
  } catch (err) {
    log("error", "Não foi possível iniciar o Whisper.", err);
    engineStatus = { kind: "error", message: err instanceof Error ? err.message : String(err) };
    broadcastState();
  }
}

app.on("second-instance", openHub);
app.on("window-all-closed", () => {
  // continua na bandeja
});
app.on("before-quit", () => {
  whisper.stop();
});

void app.whenReady().then(() => {
  app.setAppUserModelId("local.jotme-clone");
  log("info", `Iniciando JotMe Clone ${app.getVersion()} (Electron ${process.versions.electron}).`);
  Menu.setApplicationMenu(null);
  spawnRecorder();
  configureAudioCapturePermissions();
  liveWin = createLiveWindow(settings.stealthMode);
  wireIpc();
  createTray();
  openHub();
  void bootWhisper();
});
