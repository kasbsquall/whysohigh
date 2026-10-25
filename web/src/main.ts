// Loads Linda's runs from the server and keeps the page in step with the tab and the memory switch.

import "./styles.css";
import type { DemoPayload } from "../../src/demo.ts";
import { pageView, type PageView } from "./model.ts";
import { failure, panel, skeleton, tabWhen, type Tab } from "./view.ts";

interface State {
  readonly tab: Tab;
  readonly memoryOn: boolean;
}

const TABS: readonly Tab[] = ["first", "second"];

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html.`);
  return el;
};

const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reading one day of the weather strip, by pointer or by arrow keys. */
function wireStrip(root: HTMLElement): void {
  const plot = root.querySelector<HTMLElement>(".plot");
  const out = root.querySelector<HTMLElement>("#readout span");
  if (!plot || !out) return;
  const cells = [...plot.querySelectorAll<HTMLElement>(".day")];
  let current = -1;
  const show = (i: number): void => {
    const k = Math.max(0, Math.min(cells.length - 1, i));
    if (k === current) return;
    cells[current]?.classList.remove("is-on");
    current = k;
    const cell = cells[k];
    cell.classList.add("is-on");
    const { date = "", hi = "", lo = "", bill = "" } = cell.dataset;
    const [y, m, d] = date.split("-").map(Number);
    const when = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const mean = ((Number(hi) + Number(lo)) / 2).toFixed(1);
    const text = `${when}: high ${hi}°F, low ${lo}°F, average ${mean}°F. In the ${bill}.`;
    out.textContent = text;
    plot.setAttribute("aria-valuenow", String(k + 1));
    plot.setAttribute("aria-valuetext", text);
  };
  plot.addEventListener("pointermove", (e) => {
    const r = plot.getBoundingClientRect();
    show(Math.floor(((e.clientX - r.left) / r.width) * cells.length));
  });
  plot.addEventListener("pointerleave", () => {
    if (document.activeElement === plot) return;
    cells[current]?.classList.remove("is-on");
    current = -1;
  });
  plot.addEventListener("keydown", (e) => {
    const steps: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 7, PageDown: -7 };
    let next: number | null = null;
    if (e.key in steps) next = (current < 0 ? 0 : current + steps[e.key]);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = cells.length - 1;
    if (next === null) return;
    e.preventDefault();
    show(next);
  });
  plot.addEventListener("focus", () => {
    if (current < 0) show(0);
  });
}

/** The weather row lights up both bills on the strip; its button keeps them lit and brings the strip into view. */
function wireWeather(root: HTMLElement): void {
  const stripEl = root.querySelector<HTMLElement>("#strip");
  const row = root.querySelector<HTMLElement>(".is-weather-row");
  const btn = row?.querySelector<HTMLButtonElement>(".weather-btn");
  if (!stripEl || !row || !btn) return;
  const pinned = (): boolean => btn.getAttribute("aria-pressed") === "true";
  const set = (on: boolean): void => {
    stripEl.classList.toggle("is-weather", on);
  };
  row.addEventListener("pointerenter", () => set(true));
  row.addEventListener("pointerleave", () => set(pinned()));
  row.addEventListener("focusin", () => set(true));
  row.addEventListener("focusout", (e) => {
    if (!row.contains(e.relatedTarget as Node | null)) set(pinned());
  });
  btn.addEventListener("click", () => {
    const on = !pinned();
    btn.setAttribute("aria-pressed", String(on));
    set(on);
    if (on) stripEl.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  });
}

function render(page: PageView, state: State, onToggle: () => void, focusSwitch = false): void {
  const second = state.tab === "second";
  $("household").textContent = `${page.household.name}, ${page.household.utility} residential, ${page.household.city}`;
  $("tab-first-label").textContent = page.first.tabLabel;
  $("tab-first-when").textContent = tabWhen(page.first);
  $("tab-second-label").textContent = page.withMemory.tabLabel;
  $("tab-second-when").textContent = tabWhen(page.withMemory);
  for (const [id, on] of [["tab-first", !second], ["tab-second", second]] as const) {
    $(id).setAttribute("aria-selected", String(on));
    $(id).tabIndex = on ? 0 : -1;
  }
  const main = $("page");
  main.setAttribute("aria-labelledby", second ? "tab-second" : "tab-first");
  // The entrance plays when a bill is shown, not when the switch changes the reading.
  main.classList.toggle("settled", focusSwitch);
  $("panel").innerHTML = panel(page, state.tab, state.memoryOn);
  main.setAttribute("aria-busy", "false");

  wireStrip(main);
  wireWeather(main);
  const sw = document.getElementById("memSwitch");
  sw?.addEventListener("click", onToggle);
  if (focusSwitch) sw?.focus();
}

function wireTabs(getState: () => State, set: (s: State) => void): void {
  TABS.forEach((tab, i) => {
    const el = $(`tab-${tab}`);
    el.addEventListener("click", () => {
      if (getState().tab !== tab) set({ ...getState(), tab });
    });
    el.addEventListener("keydown", (e) => {
      const keys: Readonly<Record<string, number>> = {
        ArrowRight: (i + 1) % TABS.length,
        ArrowLeft: (i - 1 + TABS.length) % TABS.length,
        Home: 0,
        End: TABS.length - 1,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const next = TABS[keys[e.key]];
      if (getState().tab !== next) set({ ...getState(), tab: next });
      $(`tab-${next}`).focus();
    });
  });
}

async function load(): Promise<void> {
  let page: PageView | null = null;
  let state: State = { tab: location.hash === "#october" ? "second" : "first", memoryOn: true };
  const toggle = (): void => {
    state = { ...state, memoryOn: !state.memoryOn };
    if (page) render(page, state, toggle, true);
  };
  const set = (next: State): void => {
    state = next;
    if (page) render(page, state, toggle);
  };
  wireTabs(() => state, set);

  const start = async (): Promise<void> => {
    $("page").setAttribute("aria-busy", "true");
    if (!page) $("household").innerHTML = `<span class="sk-line on-dark" aria-hidden="true"></span><span class="sr-only">Loading the household</span>`;
    $("panel").innerHTML = skeleton();
    try {
      const res = await fetch("/api/demo");
      const body = (await res.json().catch(() => null)) as DemoPayload | { error: string } | null;
      if (body === null) throw new Error("The explanation service is not answering. Please try again in a minute.");
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "The explanation service had a problem. Please try again in a minute.");
      page = pageView(body);
      render(page, state, toggle);
    } catch (error: unknown) {
      $("page").setAttribute("aria-busy", "false");
      $("household").textContent = "Household not loaded";
      $("panel").innerHTML = failure(error instanceof Error ? error.message : "Something went wrong.");
      $("retry").addEventListener("click", () => void start());
    }
  };
  await start();
}

void load();
