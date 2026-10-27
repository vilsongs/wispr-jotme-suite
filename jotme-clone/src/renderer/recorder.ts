/**
 * Janela oculta de captura dupla:
 * - Canal "you": Microfone do usuário (com cancelamento de eco)
 * - Canal "them": Áudio do sistema via WASAPI Loopback (Google Meet, Zoom, Teams, etc.)
 * Cada canal passa por um VoiceSegmenter independente em 16 kHz.
 */

import { VoiceSegmenter, type Speaker } from "../core/segmenter";
import type { CaptureMode } from "../core/settings";
import { rms, SAMPLE_RATE } from "../core/wav";
import type { AudioLevels, RecorderCommand } from "../shared/ipc";

declare const recorderApi: {
  onCommand(handler: (req: { id: number; cmd: RecorderCommand; payload?: unknown }) => void): void;
  reply(reply: { id: number; ok: boolean; data?: unknown; error?: string }): void;
  sendSegment(speaker: Speaker, samples: Float32Array): void;
  sendLevels(levels: AudioLevels): void;
};

const LEVEL_INTERVAL_MS = 80;

interface ChannelPipe {
  speaker: Speaker;
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
  segmenter: VoiceSegmenter;
  peak: number;
}

interface ActiveCapture {
  channels: ChannelPipe[];
  paused: boolean;
  levelTimer: number;
}

let active: ActiveCapture | null = null;

async function buildChannelPipe(speaker: Speaker, stream: MediaStream, isPaused: () => boolean): Promise<ChannelPipe> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    await ctx.audioWorklet.addModule("pcm-worklet.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    const preGain = ctx.createGain();
    // Amplifica o microfone (+6.8 dB) para captar fala em volume normal/baixo com facilidade
    preGain.gain.value = speaker === "you" ? 2.2 : 1.2;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(preGain).connect(node).connect(mute).connect(ctx.destination);

    const segmenter = new VoiceSegmenter({
      sampleRate: SAMPLE_RATE,
      onSegment: (samples) => recorderApi.sendSegment(speaker, samples),
    });

    const pipe: ChannelPipe = { speaker, stream, ctx, node, segmenter, peak: 0 };
    node.port.onmessage = (event: MessageEvent<{ chunk: Float32Array; flushed: boolean }>) => {
      if (isPaused()) return;
      const chunk = event.data.chunk;
      if (chunk.length > 0) {
        pipe.peak = Math.max(pipe.peak, rms(chunk));
        segmenter.push(chunk);
      }
    };
    return pipe;
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    throw err;
  }
}

async function openMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

async function openSystemLoopbackStream(): Promise<MediaStream> {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  // Descarta imediatamente a trilha de vídeo: só queremos o áudio WASAPI Loopback
  displayStream.getVideoTracks().forEach((t) => t.stop());
  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    throw new Error("Nenhuma trilha de áudio do sistema disponível.");
  }
  return new MediaStream(audioTracks);
}

async function startCapture(mode: CaptureMode): Promise<void> {
  if (active) teardown();
  const state: ActiveCapture = { channels: [], paused: false, levelTimer: 0 };
  const isPaused = () => state.paused;

  try {
    if (mode === "both" || mode === "mic") {
      const micStream = await openMicStream();
      state.channels.push(await buildChannelPipe("you", micStream, isPaused));
    }
    if (mode === "both" || mode === "system") {
      const sysStream = await openSystemLoopbackStream();
      state.channels.push(await buildChannelPipe("them", sysStream, isPaused));
    }
  } catch (err) {
    for (const ch of state.channels) {
      ch.stream.getTracks().forEach((t) => t.stop());
      void ch.ctx.close();
    }
    throw err;
  }

  state.levelTimer = window.setInterval(() => {
    const levels: AudioLevels = { you: 0, them: 0 };
    for (const ch of state.channels) {
      levels[ch.speaker] = ch.peak;
      ch.peak = 0;
    }
    recorderApi.sendLevels(levels);
  }, LEVEL_INTERVAL_MS);

  active = state;
}

function flushAll(): void {
  if (!active) return;
  for (const ch of active.channels) {
    ch.segmenter.flush();
  }
}

function teardown(): void {
  if (!active) return;
  window.clearInterval(active.levelTimer);
  for (const ch of active.channels) {
    try {
      ch.segmenter.flush();
    } catch {
      // ignora erro ao descarregar
    }
    ch.stream.getTracks().forEach((t) => t.stop());
    void ch.ctx.close();
  }
  active = null;
}

const errorText = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

async function handleCommand(id: number, cmd: RecorderCommand, payload?: unknown): Promise<void> {
  try {
    if (cmd === "start") {
      const mode = (payload as { mode?: CaptureMode } | undefined)?.mode ?? "both";
      await startCapture(mode);
      recorderApi.reply({ id, ok: true });
    } else if (cmd === "pause") {
      if (active) {
        flushAll();
        active.paused = true;
      }
      recorderApi.reply({ id, ok: true });
    } else if (cmd === "resume") {
      if (active) active.paused = false;
      recorderApi.reply({ id, ok: true });
    } else if (cmd === "stop") {
      teardown();
      recorderApi.reply({ id, ok: true });
    }
  } catch (err) {
    teardown();
    recorderApi.reply({ id, ok: false, error: errorText(err) });
  }
}

let queue: Promise<void> = Promise.resolve();
recorderApi.onCommand(({ id, cmd, payload }) => {
  queue = queue.then(() => handleCommand(id, cmd, payload));
});
