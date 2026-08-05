import { el } from "./dom.ts"

export type Overlay = {
  readonly close: () => void
  readonly panel: HTMLElement
}

const EXIT_FALLBACK_MS = 400
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

const focusables = (root: HTMLElement): readonly HTMLElement[] =>
  Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )

type OverlayOptions = {
  readonly panel: HTMLElement
  /** Background element that receives `inert` while the overlay is open. */
  readonly background: HTMLElement
  readonly onClose: () => void
  /** Called before close; return false to veto (dirty guard). */
  readonly canClose?: () => boolean
}

/**
 * Mounts an overlay-stack (DESIGN.md 5.7): scrim and panel share one grid cell,
 * so they can never desynchronize. Traps focus, restores it on close, and
 * marks the background `inert` so keystrokes cannot leak to the terminal.
 */
export function mountOverlay(options: OverlayOptions): Overlay {
  const { panel, background } = options
  const scrim = el("div", { class: "overlay__scrim" })
  const root = el("div", { class: "overlay" }, [scrim, panel])
  const restoreTo = document.activeElement
  let closed = false

  const close = (): void => {
    if (closed) return
    if (options.canClose !== undefined && !options.canClose()) return
    closed = true
    root.dataset["closing"] = "true"
    background.removeAttribute("inert")
    document.removeEventListener("keydown", onKeydown, true)
    const finish = (): void => {
      root.remove()
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
      options.onClose()
    }
    // Exit animation is opacity/transform only; fall through if it never fires.
    const timer = setTimeout(finish, EXIT_FALLBACK_MS)
    panel.addEventListener(
      "animationend",
      () => {
        clearTimeout(timer)
        finish()
      },
      { once: true },
    )
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== "Tab") return
    const items = focusables(panel)
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  scrim.addEventListener("click", close)
  document.addEventListener("keydown", onKeydown, true)
  background.setAttribute("inert", "")
  document.body.appendChild(root)

  const initial = focusables(panel)[0]
  if (initial !== undefined) initial.focus()
  else panel.focus()

  return { close, panel }
}
