import type { Terminal } from "ghostty-web"

type CursorPosition = {
  readonly viewportX: number
  readonly viewportY: number
}

type CellPosition = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function readCursor(terminal: Terminal): CursorPosition | undefined {
  const cursor = terminal.wasmTerm?.getCursor()
  if (cursor === undefined) return undefined
  const { viewportX, viewportY } = cursor
  if (!Number.isFinite(viewportX) || !Number.isFinite(viewportY)) return undefined
  return { viewportX, viewportY }
}

function cursorCell(terminal: Terminal): CellPosition | undefined {
  const metrics = terminal.renderer?.getMetrics()
  const cursor = readCursor(terminal)
  if (metrics === undefined || cursor === undefined) return undefined
  // A cursor scrolled out of the viewport has no on-screen cell; callers hide
  // the overlay rather than pin it to a row the user is not looking at.
  if (cursor.viewportY < 0 || cursor.viewportY >= terminal.rows) return undefined
  return {
    x: cursor.viewportX * metrics.width,
    y: cursor.viewportY * metrics.height,
    width: metrics.width,
    height: metrics.height,
  }
}

/**
 * Renders in-progress IME text at the terminal cursor.
 *
 * ghostty-web ignores `compositionupdate` and only sends text at
 * `compositionend`, and its input textarea is a 1x1 element pinned at the
 * container origin — so browsers anchor the native preedit/candidate window to
 * the bottom-left corner instead of the caret. This moves that textarea to the
 * cursor cell (fixing the UA candidate window) and draws the composing text
 * itself. It never sends input: ghostty's `compositionend` stays the sole
 * sender, so `attachImeInputForwarding` dedup semantics are unaffected.
 */
export function attachImePreedit(container: HTMLElement, terminal: Terminal): () => void {
  const overlay = document.createElement("span")
  overlay.className = "term-preedit"
  overlay.hidden = true
  container.appendChild(overlay)

  let composing = false
  let trackers: readonly (() => void)[] = []

  const hide = (): void => {
    overlay.hidden = true
    overlay.textContent = ""
  }

  const place = (): void => {
    const cell = cursorCell(terminal)
    if (cell === undefined || overlay.textContent === "") {
      overlay.hidden = true
      return
    }
    overlay.style.transform = `translate(${cell.x}px, ${cell.y}px)`
    overlay.style.fontSize = `${terminal.options.fontSize}px`
    overlay.style.lineHeight = `${cell.height}px`
    overlay.hidden = false
    const textarea = terminal.textarea
    if (textarea === undefined) return
    // The UA anchors the candidate window to the focused element's box, so the
    // 1x1 textarea has to travel with the cursor. Clamped inside the container
    // because iOS scrolls an off-screen focused input into view.
    const maxX = Math.max(0, container.clientWidth - 1)
    const maxY = Math.max(0, container.clientHeight - 1)
    textarea.style.left = `${Math.min(Math.max(0, cell.x), maxX)}px`
    textarea.style.top = `${Math.min(Math.max(0, cell.y), maxY)}px`
  }

  const startTracking = (): void => {
    if (trackers.length > 0) return
    trackers = [terminal.onCursorMove(place).dispose, terminal.onScroll(place).dispose]
  }

  const stopTracking = (): void => {
    for (const dispose of trackers) dispose()
    trackers = []
  }

  const onCompositionStart = (): void => {
    composing = true
    startTracking()
    place()
  }

  const onCompositionUpdate = (event: CompositionEvent): void => {
    if (!composing) return
    overlay.textContent = event.data
    place()
  }

  const onCompositionEnd = (): void => {
    composing = false
    stopTracking()
    // Hide before ghostty's own compositionend handler sends the committed
    // text, so the overlay and the PTY echo never show the same syllable twice.
    hide()
    const textarea = terminal.textarea
    if (textarea === undefined) return
    // ghostty never clears the textarea after commit; a growing value drifts
    // the caret rect the candidate window anchors to.
    queueMicrotask(() => {
      textarea.value = ""
    })
  }

  container.addEventListener("compositionstart", onCompositionStart, { capture: true })
  container.addEventListener("compositionupdate", onCompositionUpdate, { capture: true })
  container.addEventListener("compositionend", onCompositionEnd, { capture: true })

  return () => {
    container.removeEventListener("compositionstart", onCompositionStart, { capture: true })
    container.removeEventListener("compositionupdate", onCompositionUpdate, { capture: true })
    container.removeEventListener("compositionend", onCompositionEnd, { capture: true })
    stopTracking()
    overlay.remove()
  }
}
