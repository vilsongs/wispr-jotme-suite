import { contextBridge, ipcRenderer } from "electron";
import { IPC, type OverlayMessage } from "../../shared/ipc";

contextBridge.exposeInMainWorld("overlayApi", {
  onState(handler: (msg: OverlayMessage) => void): void {
    ipcRenderer.on(IPC.overlayState, (_e, msg) => handler(msg));
  },
  onLevel(handler: (level: number) => void): void {
    ipcRenderer.on(IPC.overlayLevel, (_e, level) => handler(level));
  },
});
