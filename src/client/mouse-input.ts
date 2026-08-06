import type { Terminal } from "ghostty-web"
import { encodeMouseClick, encodeMouseMotion, type MouseButton } from "./mouse-encode.ts"

/**
 * Translates pointer and touch input into SGR 1006 mouse reports while a TUI has
 * mouse tracking enabled (modes 1000/1002/1003/1006). When tracking is off the
 * terminal's native behavior (selection, scrollback) is left untouched.
 */

const MOTION_THROTTLE_MS = 40

function trackingActive(terminal: Terminal): boolean {
  try {
    return terminal.hasMouseTracking()
  } catch {
    return false
  }
}

function cellAt(
  terminal: Terminal,
  container: HTMLElement,
  clientX: number,
  clientY: number,
): { col: number; row: number } {
  const canvas = container.querySelector("canvas")
  const rect = (canvas ?? container).getBoundingClientRect()
  const col = Math.floor(((clientX - rect.left) / rect.width) * terminal.cols)
  const row = Math.floor(((clientY - rect.top) / rect.height) * terminal.rows)
  return {
    col: Math.max(0, Math.min(terminal.cols - 1, col)),
    row: Math.max(0, Math.min(terminal.rows - 1, row)),
  }
}

function domButton(event: MouseEvent): MouseButton {
  return event.button === 1 ? "middle" : event.button === 2 ? "right" : "left"
}

function modsOf(event: MouseEvent | WheelEvent): { shift: boolean; alt: boolean; ctrl: boolean } {
  return { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey }
}

export function attachMouseInput(
  container: HTMLElement,
  terminal: Terminal,
  sendInput: (data: string) => void,
): () => void {
  let lastMotionAt = 0
  let heldButton: MouseButton | "none" = "none"

  const onMouseDown = (event: MouseEvent): void => {
    if (!trackingActive(terminal)) return
    const button = domButton(event)
    const { col, row } = cellAt(terminal, container, event.clientX, event.clientY)
    heldButton = button
    sendInput(encodeMouseClick(button, "press", col, row, modsOf(event)))
    event.preventDefault()
    event.stopPropagation()
  }

  const onMouseUp = (event: MouseEvent): void => {
    if (!trackingActive(terminal)) return
    const button = domButton(event)
    const { col, row } = cellAt(terminal, container, event.clientX, event.clientY)
    heldButton = "none"
    sendInput(encodeMouseClick(button, "release", col, row, modsOf(event)))
    event.preventDefault()
    event.stopPropagation()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!trackingActive(terminal)) return
    const now = Date.now()
    if (now - lastMotionAt < MOTION_THROTTLE_MS) return
    const anyMotion = terminal.getMode(1003)
    const buttonMotion = terminal.getMode(1002)
    if (!anyMotion && !(buttonMotion && heldButton !== "none")) return
    lastMotionAt = now
    const { col, row } = cellAt(terminal, container, event.clientX, event.clientY)
    sendInput(encodeMouseMotion(anyMotion ? "none" : heldButton, col, row, modsOf(event)))
    event.preventDefault()
  }

  container.addEventListener("mousedown", onMouseDown, { capture: true })
  container.addEventListener("mouseup", onMouseUp, { capture: true })
  container.addEventListener("mousemove", onMouseMove, { capture: true })

  // Wheel → buttons 64/65 while tracking; otherwise let native scrollback run.
  const detachWheel = (() => {
    const handler = (event: WheelEvent): boolean => {
      if (!trackingActive(terminal)) return false
      const { col, row } = cellAt(terminal, container, event.clientX, event.clientY)
      const button: MouseButton = event.deltaY < 0 ? "wheel-up" : "wheel-down"
      sendInput(encodeMouseClick(button, "press", col, row, modsOf(event)))
      return true
    }
    terminal.attachCustomWheelEventHandler(handler)
    return () => terminal.attachCustomWheelEventHandler(() => false)
  })()

  // Touch: tap = click at cell; vertical drag = scroll buttons, both only while
  // tracking. (Native touch-scroll continues to own the tracking-off path.)
  let touchStartY: number | undefined
  const onTouchStart = (event: TouchEvent): void => {
    touchStartY = event.touches[0]?.clientY
  }
  const onTouchMove = (event: TouchEvent): void => {
    if (!trackingActive(terminal)) return
    const touch = event.touches[0]
    if (touch === undefined || touchStartY === undefined) return
    const now = Date.now()
    if (now - lastMotionAt < MOTION_THROTTLE_MS) return
    const deltaY = touchStartY - touch.clientY
    if (Math.abs(deltaY) < 12) return
    lastMotionAt = now
    touchStartY = touch.clientY
    const { col, row } = cellAt(terminal, container, touch.clientX, touch.clientY)
    sendInput(encodeMouseClick(deltaY < 0 ? "wheel-down" : "wheel-up", "press", col, row))
    event.preventDefault()
  }
  const onTouchEnd = (event: TouchEvent): void => {
    if (!trackingActive(terminal)) return
    const touch = event.changedTouches[0]
    if (touch === undefined || touchStartY === undefined) return
    const moved = touchStartY !== undefined && Math.abs(touch.clientY - touchStartY) > 12
    touchStartY = undefined
    if (moved) return
    const { col, row } = cellAt(terminal, container, touch.clientX, touch.clientY)
    sendInput(encodeMouseClick("left", "press", col, row))
    sendInput(encodeMouseClick("left", "release", col, row))
    event.preventDefault()
  }
  container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
  container.addEventListener("touchmove", onTouchMove, { capture: true, passive: false })
  container.addEventListener("touchend", onTouchEnd, { capture: true })

  return () => {
    container.removeEventListener("mousedown", onMouseDown, { capture: true })
    container.removeEventListener("mouseup", onMouseUp, { capture: true })
    container.removeEventListener("mousemove", onMouseMove, { capture: true })
    container.removeEventListener("touchstart", onTouchStart, { capture: true })
    container.removeEventListener("touchmove", onTouchMove, { capture: true })
    container.removeEventListener("touchend", onTouchEnd, { capture: true })
    detachWheel()
  }
}
