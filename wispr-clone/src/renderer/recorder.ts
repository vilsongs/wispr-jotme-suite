/** Janela oculta: captura do microfone em 16 kHz mono e sons de início/fim. */

import type { RecorderCommand, SoundKind } from "../shared/ipc";
import { concatChunks, rms, SAMPLE_RATE } from "../core/wav";

declare const recorderApi: {
  onCommand(handler: (req: { id: number; cmd: RecorderCommand }) => void): void;
  reply(reply: { id: number; ok: boolean; data?: unknown; error?: string }): void;
  sendLevel(level: number): void;
  onSound(handler: (kind: SoundKind) => void): void;
};

const LEVEL_INTERVAL_MS = 50;
const FLUSH_TIMEOUT_MS = 1_000;

interface Session {
  ctx: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
  chunks: Float32Array[];
  peak: number;
  levelTimer: number;
}

let session: Session | null = null;

async function openAudio(): Promise<{ stream: MediaStream; ctx: AudioContext; node: AudioWorkletNode }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
  });
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await ctx.audioWorklet.addModule("pcm-worklet.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
    return { stream, ctx, node };
  } catch (err) {
    // falhou no meio da montagem: solta o microfone e o contexto de áudio
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    throw err;
  }
}

async function start(): Promise<void> {
  if (session) teardown();
  const { stream, ctx, node } = await openAudio();
  const s: Session = { ctx, stream, node, chunks: [], peak: 0, levelTimer: 0 };
  node.port.onmessage = (event: MessageEvent<{ chunk: Float32Array; flushed: boolean }>) => {
    s.chunks.push(event.data.chunk);
    s.peak = Math.max(s.peak, rms(event.data.chunk));
  };
  s.levelTimer = window.setInterval(() => {
    recorderApi.sendLevel(s.peak);
    s.peak = 0;
  }, LEVEL_INTERVAL_MS);
  session = s;
}

function flush(s: Session): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, FLUSH_TIMEOUT_MS);
    const previous = s.node.port.onmessage;
    s.node.port.onmessage = (event: MessageEvent<{ chunk: Float32Array; flushed: boolean }>) => {
      previous?.call(s.node.port, event);
      if (event.data.flushed) {
        window.clearTimeout(timer);
        resolve();
      }
    };
    s.node.port.postMessage("flush");
  });
}

function teardown(): void {
  if (!session) return;
  window.clearInterval(session.levelTimer);
  session.stream.getTracks().forEach((t) => t.stop());
  void session.ctx.close();
  session = null;
}

async function stop(): Promise<Float32Array> {
  const s = session;
  if (!s) return new Float32Array(0);
  await flush(s);
  const samples = concatChunks(s.chunks);
  teardown();
  return samples;
}

// ---- sons curtos gerados por código (sem arquivos de áudio) ----
let soundCtx: AudioContext | null = null;
const TONES: Record<SoundKind, Array<[freq: number, ms: number]>> = {
  start: [
    [660, 70],
    [880, 90],
  ],
  stop: [
    [880, 70],
    [660, 90],
  ],
  error: [
    [240, 180],
  ],
};

function playSound(kind: SoundKind): void {
  soundCtx ??= new AudioContext();
  const ctx = soundCtx;
  let t = ctx.currentTime + 0.01;
  for (const [freq, ms] of TONES[kind]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
    t += ms / 1000;
  }
}

const errorText = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

async function runCommand(id: number, cmd: RecorderCommand): Promise<void> {
  try {
    if (cmd === "start") {
      await start();
      recorderApi.reply({ id, ok: true });
    } else if (cmd === "stop") {
      recorderApi.reply({ id, ok: true, data: await stop() });
    } else {
      teardown();
      recorderApi.reply({ id, ok: true });
    }
  } catch (err) {
    teardown();
    recorderApi.reply({ id, ok: false, error: errorText(err) });
  }
}

// Comandos em fila: um "cancel" ou novo "start" nunca corre em paralelo com um "start" pela metade.
let queue: Promise<void> = Promise.resolve();
recorderApi.onCommand(({ id, cmd }) => {
  queue = queue.then(() => runCommand(id, cmd));
});

recorderApi.onSound(playSound);
