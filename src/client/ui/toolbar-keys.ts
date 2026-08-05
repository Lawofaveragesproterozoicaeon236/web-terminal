import type { IconName } from "./dom.ts"

type KeyKind = "default" | "modifier" | "combo" | "action"

type KeyDef = {
  readonly id: string
  readonly label: string
  readonly kind: KeyKind
  readonly send?: string
  readonly ariaLabel?: string
  readonly icon?: IconName
}

export const KEYS = [
  { id: "esc", label: "Esc", kind: "default", send: "\u001b" },
  { id: "tab", label: "Tab", kind: "default", send: "\t" },
  { id: "ctrl", label: "Ctrl", kind: "modifier" },
  { id: "alt", label: "Alt", kind: "modifier" },
  {
    id: "up",
    label: "",
    kind: "default",
    send: "\u001b[A",
    ariaLabel: "Arrow up",
    icon: "arrow-up",
  },
  {
    id: "down",
    label: "",
    kind: "default",
    send: "\u001b[B",
    ariaLabel: "Arrow down",
    icon: "arrow-down",
  },
  {
    id: "left",
    label: "",
    kind: "default",
    send: "\u001b[D",
    ariaLabel: "Arrow left",
    icon: "arrow-left",
  },
  {
    id: "right",
    label: "",
    kind: "default",
    send: "\u001b[C",
    ariaLabel: "Arrow right",
    icon: "arrow-right",
  },
  { id: "pipe", label: "|", kind: "default", send: "|" },
  { id: "tilde", label: "~", kind: "default", send: "~" },
  { id: "slash", label: "/", kind: "default", send: "/" },
  { id: "dash", label: "-", kind: "default", send: "-" },
  { id: "ctrl-c", label: "^C", kind: "combo", send: "\u0003" },
  { id: "paste", label: "\u2318V", kind: "action", ariaLabel: "Paste from clipboard" },
] as const satisfies readonly KeyDef[]

type KeyId = (typeof KEYS)[number]["id"]
export type ModifierId = Extract<KeyId, "ctrl" | "alt">

export const REPEATING: ReadonlySet<KeyId> = new Set(["up", "down", "left", "right", "ctrl-c"])
export const REPEAT_DELAY_MS = 400
export const REPEAT_INTERVAL_MS = 60
