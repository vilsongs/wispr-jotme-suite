/** Criação das três janelas: gravador (oculta), pílula de status e painel principal. */

import { BrowserWindow, screen, type WebContents } from "electron";
import { join } from "node:path";

const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 56;
const OVERLAY_BOTTOM_GAP = 72;

const dist = (file: string) => join(__dirname, file);

/** Bloqueia navegação e janelas novas: as telas só carregam os próprios arquivos locais. */
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

export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false, // nunca rouba o foco do campo onde o texto vai entrar
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { ...securePrefs("preload-overlay.js"), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true);
  lockDown(win.webContents);
  void win.loadFile(dist("overlay.html"));
  return win;
}

/** Posiciona a pílula na parte de baixo da tela onde está o mouse e mostra sem foco. */
export function showOverlayNearCursor(win: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2),
    y: workArea.y + workArea.height - OVERLAY_HEIGHT - OVERLAY_BOTTOM_GAP,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  });
  if (!win.isVisible()) win.showInactive();
}

export function createHubWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 620,
    minHeight: 480,
    show: false,
    title: "Wispr Clone",
    autoHideMenuBar: true,
    backgroundColor: "#f4f1ea",
    webPreferences: securePrefs("preload-hub.js"),
  });
  lockDown(win.webContents);
  win.once("ready-to-show", () => win.show());
  void win.loadFile(dist("hub.html"));
  return win;
}
