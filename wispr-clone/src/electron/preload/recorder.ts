import { contextBridge, ipcRenderer } from "electron";
import { IPC, type RecorderCommand, type SoundKind } from "../../shared/ipc";

interface Reply {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

contextBridge.exposeInMainWorld("recorderApi", {
  onCommand(handler: (req: { id: number; cmd: RecorderCommand }) => void): void {
    ipcRenderer.on(IPC.recorderCmd, (_e, req) => handler(req));
  },
  reply(reply: Reply): void {
    ipcRenderer.send(IPC.recorderReply, reply);
  },
  sendLevel(level: number): void {
    ipcRenderer.send(IPC.recorderLevel, level);
  },
  onSound(handler: (kind: SoundKind) => void): void {
    ipcRenderer.on(IPC.recorderSound, (_e, kind) => handler(kind));
  },
});
