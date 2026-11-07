import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AudioLevels, type LiveAnswer, type LiveToast } from "../../shared/ipc";
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
  onAnswer: (handler: (answer: LiveAnswer) => void) => {
    ipcRenderer.on(IPC.liveAnswer, (_e, answer: LiveAnswer) => handler(answer));
  },
  onToast: (handler: (toast: LiveToast) => void) => {
    ipcRenderer.on(IPC.liveToast, (_e, toast: LiveToast) => handler(toast));
  },
  sendAction: (action: "pause" | "resume" | "stop" | "open-hub" | "hide" | "expand" | "collapse" | "ask" | "screenshot") => {
    ipcRenderer.send(IPC.liveAction, action);
  },
});
