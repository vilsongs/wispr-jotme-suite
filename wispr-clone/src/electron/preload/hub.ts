import { contextBridge, ipcRenderer } from "electron";
import { IPC, type HubSettingsInput, type HubState } from "../../shared/ipc";

contextBridge.exposeInMainWorld("hubApi", {
  getState: (): Promise<HubState> => ipcRenderer.invoke(IPC.hubGetState),
  saveSettings: (input: HubSettingsInput): Promise<HubState> => ipcRenderer.invoke(IPC.hubSaveSettings, input),
  clearHistory: (): Promise<HubState> => ipcRenderer.invoke(IPC.hubClearHistory),
  copy: (text: string): Promise<boolean> => ipcRenderer.invoke(IPC.hubCopy, text),
  onChanged(handler: () => void): void {
    ipcRenderer.on(IPC.hubChanged, () => handler());
  },
});
