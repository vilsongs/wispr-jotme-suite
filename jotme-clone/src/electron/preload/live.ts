import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AudioLevels } from "../../shared/ipc";
import type { LiveSessionSnapshot } from "../../core/meetingSession";

contextBridge.exposeInMainWorld("liveApi", {
  onState: (handler: (snapshot: LiveSessionSnapshot) => void) => {
    ipcRenderer.on(IPC.liveState, (_e, snapshot) => handler(snapshot));
  },
  onLevels: (handler: (levels: AudioLevels) => void) => {
    ipcRenderer.on(IPC.liveLevels, (_e, levels) => handler(levels));
  },
  onMode: (handler: (compact: boolean) => void) => {
    ipcRenderer.on(IPC.liveMode, (_e, compact: boolean) => handler(Boolean(compact)));
  },
  sendAction: (action: "pause" | "resume" | "stop" | "open-hub" | "hide" | "expand" | "collapse") => {
    ipcRenderer.send(IPC.liveAction, action);
  },
});
