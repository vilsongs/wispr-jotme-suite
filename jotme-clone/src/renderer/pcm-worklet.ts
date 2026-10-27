/** AudioWorklet: copia o PCM (16 kHz mono) em blocos de 2048 amostras (~128 ms). */

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const BATCH = 2048;

class PcmCapture extends AudioWorkletProcessor {
  private buf = new Float32Array(BATCH);
  private filled = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data === "flush") {
        if (this.filled > 0) {
          this.port.postMessage({ chunk: this.buf.slice(0, this.filled), flushed: true });
          this.filled = 0;
        } else {
          this.port.postMessage({ chunk: new Float32Array(0), flushed: true });
        }
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buf[this.filled++] = channel[i];
      if (this.filled === BATCH) {
        this.port.postMessage({ chunk: this.buf.slice(), flushed: false });
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);

export {};
