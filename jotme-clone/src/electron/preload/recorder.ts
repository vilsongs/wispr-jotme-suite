import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AudioLevels, type RecorderCommand } from "../../shared/ipc";
import type { Speaker } from "../../core/segmenter";

contextBridge.exposeInMainWorld("recorderApi", {
  onCommand: (handler: (req: { id: number; cmd: RecorderCommand; payload?: unknown }) => void) => {
    ipcRenderer.on(IPC.recorderCmd, (_e, req) => handler(req));
  },
  reply: (reply: { id: number; ok: boolean; data?: unknown; error?: string }) => {
    ipcRenderer.send(IPC.recorderReply, reply);
  },
  sendSegment: (speaker: Speaker, samples: Float32Array) => {
    ipcRenderer.send(IPC.recorderSegment, { speaker, samples });
  },
  sendLevels: (levels: AudioLevels) => {
    ipcRenderer.send(IPC.recorderLevels, levels);
  },
});
