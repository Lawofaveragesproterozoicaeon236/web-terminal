import type { ConnectionState } from "../connection.ts"
import { button, dot, el, icon } from "./dom.ts"

type TopBar = {
  readonly element: HTMLElement
  readonly setState: (state: ConnectionState) => void
  readonly setLatency: (ms: number) => void
  readonly setSessionLabel: (label: string) => void
  readonly setSidebarExpanded: (open: boolean) => void
}

type TopBarActions = {
  readonly onToggleSidebar: () => void
  readonly onOpenSessions: () => void
}

const STATE_LABEL: Readonly<Record<ConnectionState, string>> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  closed: "Offline",
}

/** DESIGN.md 5.5 dot variants; `closed`/`connecting` map onto offline/idle. */
const STATE_DOT: Readonly<Record<ConnectionState, string>> = {
  connecting: "idle",
  connected: "connected",
  reconnecting: "reconnecting",
  closed: "offline",
}

const GOOD_LATENCY_MAX_MS = 80
const FAIR_LATENCY_MAX_MS = 200

function latencyTone(ms: number): string {
  if (ms < GOOD_LATENCY_MAX_MS) return "good"
  if (ms <= FAIR_LATENCY_MAX_MS) return "fair"
  return "poor"
}

export function createTopBar(actions: TopBarActions): TopBar {
  const statusDot = dot("idle", "Connecting")
  const statusLabel = el("span", { class: "topbar__status-label" }, ["Connecting"])
  const chip = el("span", { class: "chip", "data-tone": "unknown" }, ["--"])
  const sessionLabel = el("span", { class: "topbar__session-label" }, ["Session"])

  const sessionButton = button(
    {
      class: "topbar__session",
      "aria-haspopup": "dialog",
      title: "Switch session",
    },
    [sessionLabel],
    actions.onOpenSessions,
  )

  const sidebarToggle = button(
    {
      class: "btn btn--ghost btn--icon",
      "aria-label": "Toggle panel",
      "aria-expanded": "false",
      title: "Toggle panel",
    },
    [icon("menu")],
    actions.onToggleSidebar,
  )

  // Connection status is a polite live region (DESIGN.md 8.1).
  const status = el("div", { class: "topbar__status", role: "status", "aria-live": "polite" }, [
    statusDot,
    statusLabel,
    chip,
  ])

  const element = el("header", { class: "topbar" }, [
    el("span", { class: "topbar__brand" }, ["web-terminal"]),
    sessionButton,
    status,
    sidebarToggle,
  ])

  return {
    element,
    setState: (state) => {
      statusDot.dataset["state"] = STATE_DOT[state]
      statusDot.setAttribute("aria-label", STATE_LABEL[state])
      statusLabel.textContent = STATE_LABEL[state]
      if (state !== "connected") {
        chip.dataset["tone"] = "unknown"
        chip.textContent = "--"
      }
    },
    setLatency: (ms) => {
      chip.dataset["tone"] = latencyTone(ms)
      chip.textContent = `${ms}ms`
      chip.setAttribute("aria-label", `Round-trip latency ${ms} milliseconds`)
    },
    setSessionLabel: (label) => {
      sessionLabel.textContent = label
      sessionButton.title = `Switch session — ${label}`
    },
    setSidebarExpanded: (open) => {
      sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false")
    },
  }
}
