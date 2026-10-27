/** Pílula de status: barras que seguem o nível do microfone e rótulo por estado. */

import type { OverlayMessage } from "../shared/ipc";

declare const overlayApi: {
  onState(handler: (msg: OverlayMessage) => void): void;
  onLevel(handler: (level: number) => void): void;
};

const BAR_COUNT = 9;
// Perfil em "montanha": as barras do meio sobem mais.
const BAR_WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / BAR_COUNT));
const LEVEL_GAIN = 9; // fala normal fica em RMS ~0,02–0,1
const MIN_SCALE = 0.12;

const pill = document.getElementById("pill") as HTMLDivElement;
const label = document.getElementById("label") as HTMLSpanElement;
const barsBox = document.getElementById("bars") as HTMLDivElement;

const bars = BAR_WEIGHTS.map((_, i) => {
  const bar = document.createElement("i");
  bar.style.setProperty("--i", String(i));
  barsBox.appendChild(bar);
  return bar;
});

function setLabel(main: string, hint?: string): void {
  label.textContent = main;
  if (hint) {
    const small = document.createElement("small");
    small.textContent = ` · ${hint}`;
    label.appendChild(small);
  }
}

overlayApi.onState(({ phase, message, hotkeyLabel }) => {
  pill.dataset.phase = phase;
  // reinicia a animação de entrada
  pill.style.animation = "none";
  void pill.offsetWidth;
  pill.style.animation = "";
  if (phase === "recording") setLabel("Ouvindo…");
  else if (phase === "locked") setLabel("Mãos-livres", `${hotkeyLabel} para parar`);
  else if (phase === "processing") setLabel("Transcrevendo…");
  else if (phase === "error") setLabel(message ?? "Algo deu errado");
  if (phase === "processing" || phase === "error") bars.forEach((b) => (b.style.transform = ""));
});

overlayApi.onLevel((level) => {
  const phase = pill.dataset.phase;
  if (phase !== "recording" && phase !== "locked") return;
  const amp = Math.min(1, level * LEVEL_GAIN);
  bars.forEach((bar, i) => {
    const jitter = 0.75 + Math.random() * 0.5;
    bar.style.transform = `scaleY(${Math.max(MIN_SCALE, amp * BAR_WEIGHTS[i] * jitter).toFixed(3)})`;
  });
});
