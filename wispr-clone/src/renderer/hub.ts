/** Painel principal: histórico, dicionário e ajustes. Todo texto entra via textContent (sem HTML injetado). */

import type { HistoryEntry } from "../core/history";
import type { HubSettingsInput, HubState } from "../shared/ipc";

declare const hubApi: {
  getState(): Promise<HubState | null>;
  saveSettings(input: HubSettingsInput): Promise<HubState | null>;
  clearHistory(): Promise<HubState | null>;
  copy(text: string): Promise<boolean>;
  onChanged(handler: () => void): void;
};

const SAVED_FLASH_MS = 2_200;
const KEY_LABELS: Record<string, string[]> = { "ctrl+win": ["Ctrl", "Win"], rctrl: ["Ctrl", "direito"] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmtTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const fmtNum = new Intl.NumberFormat("pt-BR");
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// ---------- abas ----------
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function selectTab(tab: HTMLButtonElement): void {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    $(t.getAttribute("aria-controls") ?? "").hidden = !selected;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
});
selectTab(tabs[0]);

// ---------- renderização ----------
function renderEngine(state: HubState): void {
  const box = $("engine");
  box.dataset.kind = state.status.kind;
  const titles = { loading: "Carregando modelo…", ready: "Pronto para ditar", error: "Erro no motor" };
  $("engine-title").textContent = titles[state.status.kind];
  $("engine-detail").textContent = state.status.kind === "error" ? state.status.message : "100% offline";
}

function renderHeroKeys(hotkey: string): void {
  const holder = $("hero-keys");
  holder.replaceChildren(
    ...(KEY_LABELS[hotkey] ?? []).map((label) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = label;
      return kbd;
    }),
  );
}

function renderStats(history: HistoryEntry[]): void {
  $("stat-words").textContent = fmtNum.format(history.reduce((n, e) => n + countWords(e.text), 0));
  $("stat-count").textContent = fmtNum.format(history.length);
  const avg = history.length ? history.reduce((n, e) => n + e.transcribeMs, 0) / history.length / 1000 : null;
  $("stat-speed").textContent = avg === null ? "—" : `${avg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function historyItem(entry: HistoryEntry): HTMLLIElement {
  const li = document.createElement("li");
  const text = document.createElement("p");
  text.className = "text";
  text.textContent = entry.text;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${fmtTime.format(entry.at)} · ${(entry.durationMs / 1000).toFixed(1)} s de fala · transcrito em ${(entry.transcribeMs / 1000).toFixed(1)} s`;
  const copy = document.createElement("button");
  copy.className = "ghost copy";
  copy.type = "button";
  copy.textContent = "Copiar";
  copy.addEventListener("click", async () => {
    if (await hubApi.copy(entry.text)) {
      copy.textContent = "Copiado";
      setTimeout(() => (copy.textContent = "Copiar"), SAVED_FLASH_MS);
    }
  });
  li.append(text, meta, copy);
  return li;
}

function renderHistory(history: HistoryEntry[]): void {
  $("history").replaceChildren(...history.map(historyItem));
  $("history-empty").hidden = history.length > 0;
  ($("clear-history") as HTMLButtonElement).hidden = history.length === 0;
}

function fillForm(state: HubState): void {
  const s = state.settings;
  ($("hotkey") as HTMLSelectElement).value = s.hotkey;
  ($("language") as HTMLSelectElement).value = s.language;
  ($("threads") as HTMLInputElement).value = String(s.threads);
  ($("sounds") as HTMLInputElement).checked = s.sounds;
  ($("restoreClipboard") as HTMLInputElement).checked = s.restoreClipboard;
  ($("openAtLogin") as HTMLInputElement).checked = state.openAtLogin;
  ($("vocabulary") as HTMLTextAreaElement).value = s.vocabulary.join("\n");
  ($("dictionary") as HTMLTextAreaElement).value = s.dictionary.map((d) => `${d.from} => ${d.to}`).join("\n");
  $("model-name").textContent = state.modelName;
}

function render(state: HubState | null, withForm: boolean): void {
  if (!state) return;
  renderEngine(state);
  renderHeroKeys(state.settings.hotkey);
  renderStats(state.history);
  renderHistory(state.history);
  if (withForm) fillForm(state);
}

// ---------- ações ----------
function readForm(): HubSettingsInput {
  return {
    hotkey: ($("hotkey") as HTMLSelectElement).value,
    language: ($("language") as HTMLSelectElement).value,
    threads: Number(($("threads") as HTMLInputElement).value),
    sounds: ($("sounds") as HTMLInputElement).checked,
    restoreClipboard: ($("restoreClipboard") as HTMLInputElement).checked,
    openAtLogin: ($("openAtLogin") as HTMLInputElement).checked,
    vocabularyText: ($("vocabulary") as HTMLTextAreaElement).value,
    dictionaryText: ($("dictionary") as HTMLTextAreaElement).value,
  };
}

document.querySelectorAll<HTMLButtonElement>("[data-save]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    let state: HubState | null = null;
    try {
      state = await hubApi.saveSettings(readForm());
      render(state, true);
    } catch {
      state = null;
    }
    const flag = btn.parentElement?.querySelector(".saved");
    if (flag) {
      flag.textContent = state ? "Salvo." : "Não foi possível salvar.";
      setTimeout(() => (flag.textContent = ""), SAVED_FLASH_MS);
    }
  });
});

$("clear-history").addEventListener("click", async () => {
  if (confirm("Apagar todo o histórico de ditados?")) render(await hubApi.clearHistory(), false);
});

hubApi.onChanged(async () => render(await hubApi.getState(), false));
void hubApi.getState().then((state) => render(state, true));
