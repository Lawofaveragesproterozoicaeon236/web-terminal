/**
 * IME input forwarding. ghostty-web prevents `beforeinput` on the terminal
 * container to stop browser text editing, but never forwards plain
 * `insertText` insertions to the PTY — so keyboards that insert text without a
 * composition session (iOS third-party keyboards, inline suggestions) silently
 * lose input. This forwards those insertions, while staying out of the way of
 * the composition path, which ghostty's compositionend already delivers.
 */

const COMPOSITION_DEDUP_MS = 100

export function attachImeInputForwarding(
  container: HTMLElement,
  sendInput: (data: string) => void,
): () => void {
  let composing = false
  let lastCompositionEndAt = 0

  const onCompositionStart = (): void => {
    composing = true
  }
  const onCompositionEnd = (): void => {
    composing = false
    lastCompositionEndAt = Date.now()
  }
  const onBeforeInput = (event: InputEvent): void => {
    if (event.inputType !== "insertText" || event.data === null || event.data === "") return
    if (composing) return
    if (Date.now() - lastCompositionEndAt < COMPOSITION_DEDUP_MS) return
    sendInput(event.data)
  }

  container.addEventListener("compositionstart", onCompositionStart, { capture: true })
  container.addEventListener("compositionend", onCompositionEnd, { capture: true })
  container.addEventListener("beforeinput", onBeforeInput, { capture: true })
  return () => {
    container.removeEventListener("compositionstart", onCompositionStart, { capture: true })
    container.removeEventListener("compositionend", onCompositionEnd, { capture: true })
    container.removeEventListener("beforeinput", onBeforeInput, { capture: true })
  }
}
