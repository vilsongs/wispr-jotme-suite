/** Barra flutuante de legendas ao vivo (invisível no compartilhamento de tela). */

import type { LiveSessionSnapshot } from "../core/meetingSession";
import { formatClock, speakerLabel } from "../core/summary";
import type { AudioLevels } from "../shared/ipc";

declare const liveApi: {
  onState(handler: (snapshot: LiveSessionSnapshot) => void): void;
  onLevels(handler: (levels: AudioLevels) => void): void;
  onMode(handler: (compact: boolean) => void): void;
  sendAction(action: "pause" | "resume" | "stop" | "open-hub" | "hide" | "expand" | "collapse"): void;
};

const miniDashEl = document.getElementById("miniDash")!;
const miniDotEl = document.getElementById("miniDot")!;
const dotEl = document.getElementById("liveDot")!;
const clockEl = document.getElementById("liveClock")!;
const meterYouEl = document.getElementById("meterYou")!;
const meterThemEl = document.getElementById("meterThem")!;
const btnPause = document.getElementById("btnPause")!;
const btnStop = document.getElementById("btnStop")!;
const btnHub = document.getElementById("btnHub")!;
const btnHide = document.getElementById("btnHide")!;
const feedEl = document.getElementById("liveFeed")!;

let currentSnapshot: LiveSessionSnapshot | null = null;

function renderFeed(snapshot: LiveSessionSnapshot): void {
  feedEl.innerHTML = "";
  const recent = snapshot.turns.slice(-12);
  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-hint";
    empty.textContent =
      snapshot.status === "paused"
        ? "Transcrição pausada."
        : "Ouvindo a reunião… As falas aparecerão aqui em tempo real.";
    feedEl.appendChild(empty);
    return;
  }

  for (const t of recent) {
    const row = document.createElement("div");
    row.className = "turn-row";
    const tag = document.createElement("span");
    tag.className = `turn-tag ${t.speaker}`;
    tag.textContent = `[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)}:`;
    row.appendChild(tag);
    row.appendChild(document.createTextNode(` ${t.text}`));
    feedEl.appendChild(row);
  }
  feedEl.scrollTop = feedEl.scrollHeight;
}

liveApi.onState((snapshot) => {
  currentSnapshot = snapshot;
  const isPaused = snapshot.status === "paused";
  dotEl.className = `dot ${isPaused ? "paused" : "recording"}`;
  miniDotEl.classList.toggle("paused", isPaused);
  btnPause.textContent = isPaused ? "▶" : "⏸";
  clockEl.textContent = formatClock(snapshot.elapsedMs);
  renderFeed(snapshot);
});

liveApi.onLevels((levels) => {
  const pct = (v: number) => `${Math.min(100, Math.round(v * 350))}%`;
  meterYouEl.style.width = pct(levels.you);
  meterThemEl.style.width = pct(levels.them);
  const activeVoice = Math.max(levels.you, levels.them) >= 0.008;
  miniDotEl.classList.toggle("speaking", activeVoice);
});

liveApi.onMode((compact) => {
  document.body.dataset.compact = compact ? "true" : "false";
});

window.setInterval(() => {
  if (!currentSnapshot || currentSnapshot.status !== "recording") return;
  currentSnapshot.elapsedMs += 1000;
  clockEl.textContent = formatClock(snapshotElapsed());
}, 1000);

function snapshotElapsed(): number {
  return currentSnapshot ? currentSnapshot.elapsedMs : 0;
}

miniDashEl.addEventListener("click", () => {
  liveApi.sendAction("expand");
});

btnPause.addEventListener("click", () => {
  if (!currentSnapshot) return;
  liveApi.sendAction(currentSnapshot.status === "paused" ? "resume" : "pause");
});
btnStop.addEventListener("click", () => liveApi.sendAction("stop"));
btnHub.addEventListener("click", () => liveApi.sendAction("open-hub"));
btnHide.addEventListener("click", () => liveApi.sendAction("collapse"));
