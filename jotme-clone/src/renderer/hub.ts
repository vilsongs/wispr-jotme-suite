/** Lógica do painel principal: controle da reunião ao vivo, visualização de Atas, dicionário e ajustes. */

import { parseDictionaryLines } from "../core/cleanup";
import type { MeetingRecord } from "../core/meetings";
import type { CaptureMode, Settings } from "../core/settings";
import { formatClock, speakerLabel } from "../core/summary";
import type { Language } from "../core/whisperClient";
import type { AudioLevels, HubState } from "../shared/ipc";

declare const hubApi: {
  getState(): Promise<HubState>;
  onStateChanged(handler: (state: HubState) => void): void;
  onLevels(handler: (levels: AudioLevels) => void): void;
  startMeeting(title?: string): Promise<unknown>;
  pauseMeeting(): Promise<unknown>;
  resumeMeeting(): Promise<unknown>;
  stopMeeting(): Promise<MeetingRecord | null>;
  updateLiveMeta(patch: { title?: string; notes?: string }): Promise<unknown>;
  saveSettings(next: Settings): Promise<Settings>;
  updateMeeting(id: string, patch: { title?: string; notes?: string }): Promise<MeetingRecord | null>;
  deleteMeeting(id: string): Promise<boolean>;
  exportMeeting(id: string, format: "md" | "txt"): Promise<string | null>;
  copyMeeting(id: string, format: "md" | "txt"): Promise<boolean>;
  minimizeToDash(): void;
};

let state: HubState | null = null;
let selectedMeetingId: string | null = null;
let searchQuery = "";

const engineDot = document.getElementById("engineDot")!;
const engineText = document.getElementById("engineText")!;
const stealthStatus = document.getElementById("stealthStatus")!;

const liveTitleInput = document.getElementById("liveTitleInput") as HTMLInputElement;
const liveNotesInput = document.getElementById("liveNotesInput") as HTMLTextAreaElement;
const liveTimer = document.getElementById("liveTimer")!;
const btnStartLive = document.getElementById("btnStartLive")!;
const btnMinimizeLive = document.getElementById("btnMinimizeLive")!;
const btnPauseLive = document.getElementById("btnPauseLive")!;
const btnStopLive = document.getElementById("btnStopLive")!;
const hubMeterYou = document.getElementById("hubMeterYou")!;
const hubMeterThem = document.getElementById("hubMeterThem")!;
const pendingBadge = document.getElementById("pendingBadge")!;
const liveErrorBanner = document.getElementById("liveErrorBanner")!;
const hubLiveTranscript = document.getElementById("hubLiveTranscript")!;

const searchMeetingsInput = document.getElementById("searchMeetingsInput") as HTMLInputElement;
const meetingsList = document.getElementById("meetingsList")!;
const meetingDetail = document.getElementById("meetingDetail")!;

const vocabTextarea = document.getElementById("vocabTextarea") as HTMLTextAreaElement;
const dictTextarea = document.getElementById("dictTextarea") as HTMLTextAreaElement;
const btnSaveDict = document.getElementById("btnSaveDict")!;
const dictSavedMsg = document.getElementById("dictSavedMsg")!;

const setCaptureMode = document.getElementById("setCaptureMode") as HTMLSelectElement;
const setLanguage = document.getElementById("setLanguage") as HTMLSelectElement;
const setStealthMode = document.getElementById("setStealthMode") as HTMLInputElement;
const setShowFloating = document.getElementById("setShowFloating") as HTMLInputElement;
const setThreads = document.getElementById("setThreads") as HTMLInputElement;
const btnSaveSettings = document.getElementById("btnSaveSettings")!;
const settingsSavedMsg = document.getElementById("settingsSavedMsg")!;

// Navegação de abas
function switchTab(tabId: string): void {
  document.querySelectorAll<HTMLButtonElement>(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  document.querySelectorAll<HTMLElement>(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabId}`);
  });
}

document.querySelectorAll<HTMLButtonElement>(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab) switchTab(btn.dataset.tab);
  });
});

function renderSidebar(s: HubState): void {
  const isRec = s.session.status === "recording" || s.session.status === "paused";
  engineDot.className = `engine-dot ${isRec ? "recording" : s.engineStatus.kind}`;
  engineText.textContent = isRec
    ? `Gravando (${s.session.status === "paused" ? "Pausado" : "Ao Vivo"})`
    : s.engineStatus.kind === "ready"
      ? "Whisper GPU Pronto"
      : s.engineStatus.kind === "loading"
        ? "Carregando Whisper…"
        : `Erro: ${s.engineStatus.message}`;
  stealthStatus.textContent = s.settings.stealthMode ? "🔒 Modo Furtivo Ativo" : "👁 Visível na Tela";
}

function renderLiveTab(s: HubState): void {
  const { session } = s;
  const active = session.status === "recording" || session.status === "paused" || session.status === "stopping";

  btnStartLive.classList.toggle("hidden", active);
  btnMinimizeLive.classList.toggle("hidden", !active);
  btnPauseLive.classList.toggle("hidden", !active);
  btnStopLive.classList.toggle("hidden", !active);
  btnPauseLive.textContent = session.status === "paused" ? "▶ Retomar" : "⏸ Pausar";

  if (active && document.activeElement !== liveTitleInput) {
    liveTitleInput.value = session.title;
  }
  if (active && document.activeElement !== liveNotesInput) {
    liveNotesInput.value = session.notes;
  }

  liveTimer.textContent = formatClock(session.elapsedMs);
  pendingBadge.textContent =
    session.pendingSegments > 0 ? `Transcrevendo (${session.pendingSegments})…` : active ? "Ouvindo ao vivo" : "Pronto";

  if (session.errorMessage) {
    liveErrorBanner.textContent = session.errorMessage;
    liveErrorBanner.classList.remove("hidden");
  } else {
    liveErrorBanner.classList.add("hidden");
  }

  hubLiveTranscript.innerHTML = "";
  if (session.turns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = active
      ? "Ouvindo a reunião… Assim que alguém falar, a transcrição aparecerá aqui."
      : "Clique em Iniciar Reunião para capturar o som da chamada (Meet, Zoom, Teams) e o seu microfone sem bot.";
    hubLiveTranscript.appendChild(empty);
    return;
  }

  for (const t of session.turns) {
    const div = document.createElement("div");
    div.className = `bubble ${t.speaker}`;
    const meta = document.createElement("div");
    meta.className = "bubble-meta";
    meta.textContent = `[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)} · transcrito em ${t.transcribeMs} ms`;
    const body = document.createElement("div");
    body.textContent = t.text;
    div.append(meta, body);
    hubLiveTranscript.appendChild(div);
  }
  hubLiveTranscript.scrollTop = hubLiveTranscript.scrollHeight;
}

function filteredMeetings(s: HubState): readonly MeetingRecord[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return s.meetings;
  return s.meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.notes.toLowerCase().includes(q) ||
      m.turns.some((t) => t.text.toLowerCase().includes(q)),
  );
}

function renderMeetingsTab(s: HubState): void {
  const list = filteredMeetings(s);
  meetingsList.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma reunião encontrada.";
    meetingsList.appendChild(empty);
    meetingDetail.innerHTML = `<div class="empty-state">Grave uma reunião na aba "Reunião Ao Vivo" para gerar sua primeira Ata automática.</div>`;
    return;
  }

  if (!selectedMeetingId || !list.some((m) => m.id === selectedMeetingId)) {
    selectedMeetingId = list[0].id;
  }

  for (const m of list) {
    const item = document.createElement("div");
    item.className = `meeting-item ${m.id === selectedMeetingId ? "selected" : ""}`;
    const title = document.createElement("div");
    title.className = "meeting-item-title";
    title.textContent = m.title;
    const meta = document.createElement("div");
    meta.className = "meeting-item-meta";
    meta.textContent = `${new Date(m.startedAt).toLocaleString("pt-BR")} · ${formatClock(m.durationMs)} · ${m.turns.length} falas`;
    item.append(title, meta);
    item.addEventListener("click", () => {
      selectedMeetingId = m.id;
      renderMeetingsTab(s);
    });
    meetingsList.appendChild(item);
  }

  const current = list.find((m) => m.id === selectedMeetingId);
  if (current) renderMeetingDetail(current);
}

function renderBulletSection(title: string, items: readonly string[]): HTMLElement {
  const sec = document.createElement("div");
  sec.className = "summary-section";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  sec.appendChild(h3);
  const ul = document.createElement("ul");
  ul.className = "summary-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  sec.appendChild(ul);
  return sec;
}

function renderMeetingDetail(m: MeetingRecord): void {
  meetingDetail.innerHTML = "";

  const header = document.createElement("div");
  header.className = "detail-header";

  const info = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = m.title;
  const sub = document.createElement("p");
  sub.className = "meeting-item-meta";
  sub.textContent = `${new Date(m.startedAt).toLocaleString("pt-BR")} · Duração: ${formatClock(m.durationMs)} · Você: ${m.summary.youSharePct}% (${m.summary.youWords} palavras) | Reunião: ${m.summary.themSharePct}% (${m.summary.themWords} palavras)`;
  info.append(h2, sub);

  const actions = document.createElement("div");
  actions.className = "detail-actions";

  const btnCopyMd = document.createElement("button");
  btnCopyMd.className = "btn primary";
  btnCopyMd.textContent = "📋 Copiar Ata";
  btnCopyMd.addEventListener("click", async () => {
    await hubApi.copyMeeting(m.id, "md");
    btnCopyMd.textContent = "✓ Copiado!";
    setTimeout(() => (btnCopyMd.textContent = "📋 Copiar Ata"), 1800);
  });

  const btnExpMd = document.createElement("button");
  btnExpMd.className = "btn secondary";
  btnExpMd.textContent = "⬇ Exportar .md";
  btnExpMd.addEventListener("click", () => void hubApi.exportMeeting(m.id, "md"));

  const btnExpTxt = document.createElement("button");
  btnExpTxt.className = "btn secondary";
  btnExpTxt.textContent = "⬇ Exportar .txt";
  btnExpTxt.addEventListener("click", () => void hubApi.exportMeeting(m.id, "txt"));

  const btnDel = document.createElement("button");
  btnDel.className = "btn danger";
  btnDel.textContent = "Excluir";
  btnDel.addEventListener("click", async () => {
    await hubApi.deleteMeeting(m.id);
  });

  actions.append(btnCopyMd, btnExpMd, btnExpTxt, btnDel);
  header.append(info, actions);
  meetingDetail.appendChild(header);

  if (m.notes.trim()) {
    meetingDetail.appendChild(renderBulletSection("Notas Manuais", m.notes.trim().split(/\r?\n/).filter(Boolean)));
  }
  if (m.summary.actionItems.length > 0) {
    meetingDetail.appendChild(renderBulletSection("Próximos Passos / Action Items Detectados", m.summary.actionItems));
  }
  if (m.summary.highlights.length > 0) {
    meetingDetail.appendChild(renderBulletSection("Pontos Principais da Reunião", m.summary.highlights));
  }
  if (m.summary.questions.length > 0) {
    meetingDetail.appendChild(renderBulletSection("Perguntas Levantadas", m.summary.questions));
  }

  const transSec = document.createElement("div");
  transSec.className = "summary-section";
  const th3 = document.createElement("h3");
  th3.textContent = `Transcrição Completa (${m.turns.length} falas)`;
  transSec.appendChild(th3);

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "7px";
  for (const t of m.turns) {
    const b = document.createElement("div");
    b.className = `bubble ${t.speaker}`;
    b.textContent = `[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)}: ${t.text}`;
    list.appendChild(b);
  }
  transSec.appendChild(list);
  meetingDetail.appendChild(transSec);
}

function populateForms(settings: Settings): void {
  vocabTextarea.value = settings.vocabulary.join("\n");
  dictTextarea.value = settings.dictionary.map((d) => `${d.from} => ${d.to}`).join("\n");
  setCaptureMode.value = settings.captureMode;
  setLanguage.value = settings.language;
  setStealthMode.checked = settings.stealthMode;
  setShowFloating.checked = settings.showFloatingBar;
  setThreads.value = String(settings.threads);
}

function applyState(next: HubState, firstLoad = false): void {
  state = next;
  renderSidebar(next);
  renderLiveTab(next);
  renderMeetingsTab(next);
  if (firstLoad) populateForms(next.settings);
}

// Eventos
btnStartLive.addEventListener("click", () => {
  void hubApi.startMeeting(liveTitleInput.value);
});
btnMinimizeLive.addEventListener("click", () => {
  hubApi.minimizeToDash();
});
btnPauseLive.addEventListener("click", () => {
  if (!state) return;
  if (state.session.status === "paused") void hubApi.resumeMeeting();
  else void hubApi.pauseMeeting();
});
btnStopLive.addEventListener("click", async () => {
  const saved = await hubApi.stopMeeting();
  if (saved) {
    selectedMeetingId = saved.id;
    switchTab("meetings");
  }
});

liveTitleInput.addEventListener("change", () => {
  void hubApi.updateLiveMeta({ title: liveTitleInput.value });
});
liveNotesInput.addEventListener("input", () => {
  void hubApi.updateLiveMeta({ notes: liveNotesInput.value });
});
searchMeetingsInput.addEventListener("input", () => {
  searchQuery = searchMeetingsInput.value;
  if (state) renderMeetingsTab(state);
});

btnSaveDict.addEventListener("click", async () => {
  if (!state) return;
  const vocabulary = vocabTextarea.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const dictionary = parseDictionaryLines(dictTextarea.value);
  await hubApi.saveSettings({ ...state.settings, vocabulary, dictionary });
  dictSavedMsg.textContent = "Vocabulário salvo!";
  setTimeout(() => (dictSavedMsg.textContent = ""), 2000);
});

btnSaveSettings.addEventListener("click", async () => {
  if (!state) return;
  await hubApi.saveSettings({
    ...state.settings,
    captureMode: setCaptureMode.value as CaptureMode,
    language: setLanguage.value as Language,
    stealthMode: setStealthMode.checked,
    showFloatingBar: setShowFloating.checked,
    threads: Number(setThreads.value) || state.settings.threads,
  });
  settingsSavedMsg.textContent = "Ajustes salvos!";
  setTimeout(() => (settingsSavedMsg.textContent = ""), 2000);
});

hubApi.onStateChanged((next) => applyState(next));
hubApi.onLevels((levels) => {
  const pct = (v: number) => `${Math.min(100, Math.round(v * 350))}%`;
  hubMeterYou.style.width = pct(levels.you);
  hubMeterThem.style.width = pct(levels.them);
});

window.setInterval(() => {
  if (!state || state.session.status !== "recording") return;
  state.session.elapsedMs += 1000;
  liveTimer.textContent = formatClock(state.session.elapsedMs);
}, 1000);

void hubApi.getState().then((initial) => applyState(initial, true));
