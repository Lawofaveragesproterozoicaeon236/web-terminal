import { el } from "./dom.ts"

/** DESIGN.md 5.9 key variants. `data-key` values are QA driver hooks. */
type KeyKind = "default" | "modifier" | "combo" | "action"

type KeyDef = {
  readonly id: string
  readonly label: string
  readonly kind: KeyKind
  readonly send?: string
  readonly ariaLabel?: string
}

const KEYS: readonly KeyDef[] = [
  { id: "esc", label: "Esc", kind: "default", send: "\u001b" },
  { id: "tab", label: "Tab", kind: "default", send: "\t" },
  { id: "ctrl", label: "Ctrl", kind: "modifier" },
  { id: "alt", label: "Alt", kind: "modifier" },
  { id: "up", label: "\u2191", kind: "default", send: "\u001b[A", ariaLabel: "Arrow up" },
  { id: "down", label: "\u2193", kind: "default", send: "\u001b[B", ariaLabel: "Arrow down" },
  { id: "left", label: "\u2190", kind: "default", send: "\u001b[D", ariaLabel: "Arrow left" },
  { id: "right", label: "\u2192", kind: "default", send: "\u001b[C", ariaLabel: "Arrow right" },
  { id: "pipe", label: "|", kind: "default", send: "|" },
  { id: "tilde", label: "~", kind: "default", send: "~" },
  { id: "slash", label: "/", kind: "default", send: "/" },
  { id: "dash", label: "-", kind: "default", send: "-" },
  { id: "ctrl-c", label: "^C", kind: "combo", send: "\u0003" },
  { id: "paste", label: "\u2318V", kind: "action", ariaLabel: "Paste from clipboard" },
]

const REPEATING: ReadonlySet<string> = new Set(["up", "down", "left", "right", "ctrl-c"])
const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 60

export type ModifierState = { readonly ctrl: boolean; readonly alt: boolean }

export type Toolbar = {
  readonly element: HTMLElement
  /** Modifier latch state, read by the terminal key interceptor. */
  readonly modifiers: () => ModifierState
  /** Clear latches (on drawer/dialog open and compositionstart, DESIGN.md 5.9). */
  readonly clearLatches: () => void
}

export type ToolbarActions = {
  readonly sendKeys: (data: string) => void
  readonly focusTerminal: () => void
  readonly onError: (message: string) => void
  readonly onLatchChange: (state: ModifierState) => void
}

type LatchLevel = "off" | "latched" | "locked"

export function createToolbar(actions: ToolbarActions): Toolbar {
  const track = el("div", {
    class: "reel keybar",
    role: "toolbar",
    "aria-label": "Terminal keys",
    "aria-orientation": "horizontal",
  })
  const hint = el("div", { class: "keyhint", role: "status", "aria-live": "polite", hidden: true })
  const element = el("div", { class: "stack" }, [hint, track])

  const latches = new Map<string, LatchLevel>([
    ["ctrl", "off"],
    ["alt", "off"],
  ])
  const caps = new Map<string, HTMLButtonElement>()
  let keyNodes: readonly HTMLButtonElement[] = []

  const state = (): ModifierState => ({
    ctrl: latches.get("ctrl") !== "off",
    alt: latches.get("alt") !== "off",
  })

  const paint = (): void => {
    for (const [id, level] of latches) {
      const cap = caps.get(id)
      if (cap === undefined) continue
      cap.setAttribute("aria-pressed", level === "off" ? "false" : "true")
      if (level === "locked") cap.dataset["locked"] = "true"
      else delete cap.dataset["locked"]
    }
    const active = [...latches.entries()].filter(([, level]) => level !== "off")
    if (active.length === 0) {
      hint.hidden = true
      hint.textContent = ""
    } else {
      hint.hidden = false
      const names = active.map(([id]) => (id === "ctrl" ? "Ctrl" : "Alt")).join(" + ")
      hint.textContent = `${names} armed — press a key`
    }
    actions.onLatchChange(state())
  }

  const clearLatches = (): void => {
    for (const [id, level] of latches) {
      if (level === "latched") latches.set(id, "off")
    }
    paint()
  }

  /** Single tap latches, second tap locks, third clears (DESIGN.md 5.9). */
  const cycleLatch = (id: string): void => {
    const level = latches.get(id) ?? "off"
    latches.set(id, level === "off" ? "latched" : level === "latched" ? "locked" : "off")
    paint()
  }

  const pasteFromClipboard = (): void => {
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text !== "") actions.sendKeys(text)
      })
      .catch(() => actions.onError("Clipboard read was blocked."))
  }

  const fire = (def: KeyDef): void => {
    if (def.kind === "modifier") {
      cycleLatch(def.id)
      return
    }
    if (def.kind === "action") {
      pasteFromClipboard()
      return
    }
    if (def.send === undefined) return
    actions.sendKeys(applyLatches(def.send, state()))
    clearLatches()
  }

  for (const def of KEYS) {
    const cap = el("button", {
      type: "button",
      class: "key",
      "data-key": def.id,
      ...(def.kind === "modifier" ? { "aria-pressed": "false" } : {}),
      ...(def.ariaLabel === undefined ? {} : { "aria-label": def.ariaLabel }),
      tabindex: "-1",
    })
    cap.textContent = def.label
    if (def.kind === "action" && navigator.clipboard === undefined) {
      cap.disabled = true
      cap.setAttribute("aria-disabled", "true")
    }

    let repeatDelay: ReturnType<typeof setTimeout> | undefined
    let repeatTimer: ReturnType<typeof setInterval> | undefined
    const stopRepeat = (): void => {
      if (repeatDelay !== undefined) clearTimeout(repeatDelay)
      if (repeatTimer !== undefined) clearInterval(repeatTimer)
      repeatDelay = undefined
      repeatTimer = undefined
      delete cap.dataset["pressed"]
    }

    // pointerdown + preventDefault so the hidden input never blurs and the
    // on-screen keyboard cannot collapse (DESIGN.md 5.9).
    cap.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      if (cap.disabled) return
      cap.dataset["pressed"] = "true"
      fire(def)
      actions.focusTerminal()
      if (!REPEATING.has(def.id) || def.send === undefined) return
      repeatDelay = setTimeout(() => {
        repeatTimer = setInterval(() => {
          if (def.send !== undefined) actions.sendKeys(def.send)
        }, REPEAT_INTERVAL_MS)
      }, REPEAT_DELAY_MS)
    })
    for (const done of ["pointerup", "pointercancel", "pointerleave"]) {
      cap.addEventListener(done, stopRepeat)
    }
    // Keyboard activation path (pointerdown never fires for Enter/Space).
    cap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      fire(def)
    })

    caps.set(def.id, cap)
    track.appendChild(cap)
  }

  keyNodes = [...caps.values()]
  const firstKey = keyNodes[0]
  if (firstKey !== undefined) firstKey.tabIndex = 0

  // Roving tabindex across the toolbar (DESIGN.md 5.9).
  track.addEventListener("keydown", (event) => {
    const offset =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "Home"
            ? Number.NEGATIVE_INFINITY
            : event.key === "End"
              ? Number.POSITIVE_INFINITY
              : 0
    if (offset === 0) return
    event.preventDefault()
    const current = keyNodes.findIndex((node) => node === document.activeElement)
    const base = current === -1 ? 0 : current
    const next = Math.max(0, Math.min(keyNodes.length - 1, base + offset))
    const target = keyNodes[next]
    if (target === undefined) return
    for (const node of keyNodes) node.tabIndex = -1
    target.tabIndex = 0
    target.focus()
  })

  return { element, modifiers: state, clearLatches }
}

/** Ctrl maps a-z to its control byte; Alt prefixes ESC (DESIGN.md 5.9). */
export function applyLatches(data: string, mods: ModifierState): string {
  let out = data
  if (mods.ctrl && out.length === 1) {
    const code = out.toLowerCase().charCodeAt(0)
    if (code >= 97 && code <= 122) out = String.fromCharCode(code & 0x1f)
  }
  if (mods.alt) out = `\u001b${out}`
  return out
}
