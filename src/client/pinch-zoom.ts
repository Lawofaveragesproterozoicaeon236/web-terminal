const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 24

type PinchZoomActions = {
  readonly getFontSize: () => number
  readonly setFontSize: (size: number) => void
}

function distance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/**
 * Termius-style two-finger font zoom on the terminal region. Single-finger
 * gestures stay with touch-scroll (it bails on two touches), so the two paths
 * never fight over the same event.
 */
export function attachPinchZoom(container: HTMLElement, actions: PinchZoomActions): () => void {
  let baseDistance: number | undefined
  let baseFontSize = 0

  const onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) {
      baseDistance = undefined
      return
    }
    const [first, second] = [event.touches[0], event.touches[1]]
    if (first === undefined || second === undefined) return
    baseDistance = distance(first, second)
    baseFontSize = actions.getFontSize()
  }

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length !== 2 || baseDistance === undefined || baseDistance === 0) return
    const [first, second] = [event.touches[0], event.touches[1]]
    if (first === undefined || second === undefined) return
    event.preventDefault()
    const ratio = distance(first, second) / baseDistance
    const target = Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(baseFontSize * ratio)),
    )
    if (target !== actions.getFontSize()) actions.setFontSize(target)
  }

  const onTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length < 2) baseDistance = undefined
  }

  container.addEventListener("touchstart", onTouchStart, { passive: true })
  container.addEventListener("touchmove", onTouchMove, { passive: false })
  container.addEventListener("touchend", onTouchEnd, { passive: true })
  container.addEventListener("touchcancel", onTouchEnd, { passive: true })
  return () => {
    container.removeEventListener("touchstart", onTouchStart)
    container.removeEventListener("touchmove", onTouchMove)
    container.removeEventListener("touchend", onTouchEnd)
    container.removeEventListener("touchcancel", onTouchEnd)
  }
}
