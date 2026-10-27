/** AudioWorklet: copia o PCM do microfone (já em 16 kHz) em blocos de 2048 amostras. */

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
        this.port.postMessage({ chunk: this.buf.slice(0, this.filled), flushed: true });
        this.filled = 0;
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
