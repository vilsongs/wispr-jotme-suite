/**
 * Criação das três janelas do JotMe Clone:
 * 1. Gravador duplo oculto (Microfone + Loopback do Sistema)
 * 2. Barra flutuante de legendas ao vivo (com proteção contra captura de tela)
 * 3. Painel principal (Ao Vivo, Atas/Reuniões, Dicionário e Ajustes)
 */

import { BrowserWindow, screen, type WebContents } from "electron";
import { join } from "node:path";

const LIVE_WIDTH = 500;
const LIVE_HEIGHT = 260;
const LIVE_TOP_GAP = 18;
const COMPACT_WIDTH = 104;
const COMPACT_HEIGHT = 20;
const COMPACT_TOP_GAP = 8;

const dist = (file: string) => join(__dirname, file);

function lockDown(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
}

const securePrefs = (preload: string) => ({
  preload: dist(preload),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
});

export function applyStealthProtection(win: BrowserWindow | null, stealth: boolean): void {
  if (!win || win.isDestroyed()) return;
  try {
    win.setContentProtection(stealth);
  } catch {
    // alguns ambientes de teste não suportam WDA_EXCLUDEFROMCAPTURE
  }
}

export function createRecorderWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 200,
    height: 100,
    skipTaskbar: true,
    webPreferences: { ...securePrefs("preload-recorder.js"), backgroundThrottling: false },
  });
  lockDown(win.webContents);
  void win.loadFile(dist("recorder.html"));
  return win;
}

export function createLiveWindow(stealth: boolean): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - COMPACT_WIDTH) / 2),
    y: workArea.y + COMPACT_TOP_GAP,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    minWidth: 60,
    minHeight: 14,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: { ...securePrefs("preload-live.js"), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  applyStealthProtection(win, stealth);
  win.on("show", () => applyStealthProtection(win, stealth));
  win.webContents.once("did-finish-load", () => applyStealthProtection(win, stealth));
  lockDown(win.webContents);
  void win.loadFile(dist("live.html"));
  return win;
}

export function setLiveWindowCompact(win: BrowserWindow | null, compact: boolean, stealth = true): void {
  if (!win || win.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  if (compact) {
    win.setMinimumSize(60, 14);
    win.setBounds({
      width: COMPACT_WIDTH,
      height: COMPACT_HEIGHT,
      x: Math.round(workArea.x + (workArea.width - COMPACT_WIDTH) / 2),
      y: workArea.y + COMPACT_TOP_GAP,
    });
  } else {
    win.setMinimumSize(360, 170);
    win.setBounds({
      width: LIVE_WIDTH,
      height: LIVE_HEIGHT,
      x: Math.round(workArea.x + (workArea.width - LIVE_WIDTH) / 2),
      y: workArea.y + LIVE_TOP_GAP,
    });
  }
  applyStealthProtection(win, stealth);
}

export function createHubWindow(stealth: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 740,
    minHeight: 540,
    show: true,
    center: true,
    skipTaskbar: stealth,
    icon: join(__dirname, "..", "assets", "jotme-clone.ico"),
    title: "JotMe Clone — Transcrição de Reuniões Offline",
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    webPreferences: securePrefs("preload-hub.js"),
  });
  applyStealthProtection(win, stealth);
  lockDown(win.webContents);
  const bringToFront = () => {
    if (win.isDestroyed()) return;
    applyStealthProtection(win, stealth);
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.setAlwaysOnTop(false);
        applyStealthProtection(win, stealth);
      }
    }, 400);
  };
  win.on("show", () => applyStealthProtection(win, stealth));
  win.once("ready-to-show", bringToFront);
  win.webContents.once("did-finish-load", bringToFront);
  void win.loadFile(dist("hub.html"));
  return win;
}
