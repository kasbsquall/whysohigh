// Loads Linda's runs from the server and keeps the page in step with the tab and the memory switch.

import "./styles.css";
import type { DemoPayload } from "../../src/demo.ts";
import { usd } from "./format.ts";
import { pageView, type PageView, type RunView } from "./model.ts";
import { actions, checks, comparison, cover, evidence, failure, memoryPanel, rulesLine, skeleton, trip } from "./view.ts";

type Tab = "first" | "second";

interface State {
  readonly tab: Tab;
  readonly memoryOn: boolean;
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html.`);
  return el;
};

const shown = (page: PageView, state: State): RunView =>
  state.tab === "first" ? page.first : state.memoryOn ? page.withMemory : page.withoutMemory;

function render(page: PageView, state: State, onToggle: () => void, focusSwitch = false): void {
  const run = shown(page, state);
  const second = state.tab === "second";
  $("household").textContent = `${page.household.name}, ${page.household.utility} residential, ${page.household.city}`;
  $("tab-first-label").textContent = page.first.tabLabel;
  $("tab-second-label").textContent = page.withMemory.tabLabel;
  for (const [id, on] of [["tab-first", !second], ["tab-second", second]] as const) {
    $(id).setAttribute("aria-selected", String(on));
    $(id).tabIndex = on ? 0 : -1;
  }
  $("page").setAttribute("aria-labelledby", second ? "tab-second" : "tab-first");
  $("cover").innerHTML = cover(run);
  $("memory").innerHTML = second ? memoryPanel(page, state.memoryOn) : "";
  $("trip-title").textContent = `How the ${usd(Math.abs(run.changeUsd))} ${run.changeUsd < 0 ? "came off" : "adds up"}`;
  $("trip").innerHTML = trip(run);
  $("comparison").innerHTML = second ? comparison(page) : "";
  $("checks").innerHTML = checks(run);
  $("rules").innerHTML = rulesLine(run, page.rules);
  $("evidence").innerHTML = evidence(run.evidence);
  $("actions").innerHTML = actions(run);
  $("page").setAttribute("aria-busy", "false");
  $("page").classList.remove("is-loading");

  const sw = document.getElementById("memSwitch");
  sw?.addEventListener("click", onToggle);
  if (focusSwitch) sw?.focus();
}

function wireTabs(getState: () => State, set: (s: State) => void): void {
  const tabs: readonly [HTMLElement, Tab][] = [
    [$("tab-first"), "first"],
    [$("tab-second"), "second"],
  ];
  for (const [el, tab] of tabs) {
    el.addEventListener("click", () => set({ ...getState(), tab }));
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tab === "first" ? "second" : "first";
      set({ ...getState(), tab: next });
      $(next === "first" ? "tab-first" : "tab-second").focus();
    });
  }
}

async function load(): Promise<void> {
  let page: PageView | null = null;
  let state: State = { tab: "first", memoryOn: true };
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
    $("page").classList.add("is-loading");
    $("trip").innerHTML = skeleton();
    try {
      const res = await fetch("/api/demo");
      const body = (await res.json().catch(() => null)) as DemoPayload | { error: string } | null;
      if (body === null) throw new Error("The explanation service is not answering. Please try again in a minute.");
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "The explanation service had a problem. Please try again in a minute.");
      page = pageView(body);
      render(page, state, toggle);
    } catch (error: unknown) {
      $("page").setAttribute("aria-busy", "false");
      $("trip").innerHTML = failure(error instanceof Error ? error.message : "Something went wrong.");
      $("retry").addEventListener("click", () => void start());
    }
  };
  await start();
}

void load();
