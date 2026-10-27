import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AudioLevels, type HubState } from "../../shared/ipc";
import type { Settings } from "../../core/settings";

contextBridge.exposeInMainWorld("hubApi", {
  getState: (): Promise<HubState> => ipcRenderer.invoke(IPC.hubGetState),
  onStateChanged: (handler: (state: HubState) => void) => {
    ipcRenderer.on(IPC.hubStateChanged, (_e, state) => handler(state));
  },
  onLevels: (handler: (levels: AudioLevels) => void) => {
    ipcRenderer.on(IPC.hubLevels, (_e, levels) => handler(levels));
  },
  startMeeting: (title?: string) => ipcRenderer.invoke(IPC.hubStartMeeting, title),
  pauseMeeting: () => ipcRenderer.invoke(IPC.hubPauseMeeting),
  resumeMeeting: () => ipcRenderer.invoke(IPC.hubResumeMeeting),
  stopMeeting: () => ipcRenderer.invoke(IPC.hubStopMeeting),
  updateLiveMeta: (patch: { title?: string; notes?: string }) => ipcRenderer.invoke(IPC.hubUpdateLiveMeta, patch),
  saveSettings: (next: Settings) => ipcRenderer.invoke(IPC.hubSaveSettings, next),
  updateMeeting: (id: string, patch: { title?: string; notes?: string }) => ipcRenderer.invoke(IPC.hubUpdateMeeting, id, patch),
  deleteMeeting: (id: string) => ipcRenderer.invoke(IPC.hubDeleteMeeting, id),
  exportMeeting: (id: string, format: "md" | "txt") => ipcRenderer.invoke(IPC.hubExportMeeting, id, format),
  copyMeeting: (id: string, format: "md" | "txt") => ipcRenderer.invoke(IPC.hubCopyMeeting, id, format),
  minimizeToDash: () => ipcRenderer.send(IPC.liveAction, "collapse"),
});
