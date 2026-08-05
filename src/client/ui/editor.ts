import { apiRaw } from "../api.ts"
import { el, errorMessage } from "./dom.ts"
import { mountOverlay } from "./overlay.ts"

const MAX_EDITABLE_BYTES = 1024 * 1024

type EditorActions = {
  readonly background: HTMLElement
  readonly onToast: (message: string, tone: "success" | "error" | "info") => void
  readonly onClosed: () => void
}

/** Decode as UTF-8, rejecting binary. Returns undefined when not texty. */
function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

function notice(title: string, hint: string): HTMLElement {
  return el("div", { class: "empty" }, [
    el("p", { class: "empty__title" }, [title]),
    el("p", { class: "empty__hint" }, [hint]),
  ])
}

export async function openEditor(
  path: string,
  name: string,
  actions: EditorActions,
): Promise<void> {
  let bytes: Uint8Array
  try {
    const response = await apiRaw(`/api/files/content?path=${encodeURIComponent(path)}`)
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof Error) actions.onToast(error.message, "error")
    else actions.onToast(errorMessage(error, `Could not open ${name}`), "error")
    return
  }

  const titleText = el("span", { class: "dialog__title-text", title: path }, [name])
  const dirtyBadge = el("span", { class: "badge", hidden: true }, ["Unsaved"])
  const titleId = "editor-title"
  const heading = el("h2", { class: "dialog__title", id: titleId }, [titleText, dirtyBadge])

  const tooLarge = bytes.byteLength > MAX_EDITABLE_BYTES
  const text = tooLarge ? undefined : decodeText(bytes)
  const editable = text !== undefined

  const textarea = el("textarea", {
    class: "editor",
    spellcheck: "false",
    autocapitalize: "off",
    autocorrect: "off",
    wrap: "off",
    "aria-label": `Contents of ${name}`,
  })
  if (text !== undefined) textarea.value = text

  let bodyContent: HTMLElement = textarea
  if (!editable) {
    bodyContent = tooLarge
      ? notice("File is too large to edit.", "Only files up to 1MB open in the editor.")
      : notice("Binary file.", "This file is not valid UTF-8 text and cannot be edited here.")
  }
  const body = el("div", { class: "dialog__body" }, [bodyContent])

  const errorLine = el("p", { class: "dialog__error", role: "alert", hidden: true })
  const saveButton = el("button", { class: "btn btn--primary", type: "button" }, ["Save"])
  saveButton.disabled = !editable
  const cancelButton = el("button", { class: "btn btn--secondary", type: "button" }, ["Cancel"])

  const panel = el(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    [
      el("header", { class: "dialog__header" }, [heading]),
      body,
      errorLine,
      el("footer", { class: "dialog__footer" }, [cancelButton, saveButton]),
    ],
  )

  let dirty = false
  let confirming = false

  const markDirty = (next: boolean): void => {
    dirty = next
    dirtyBadge.hidden = !next
    titleText.textContent = next ? `\u2022 ${name}` : name
  }

  textarea.addEventListener("input", () => markDirty(true))

  const overlay = mountOverlay({
    panel,
    background: actions.background,
    onClose: actions.onClosed,
    // Dirty guard: a confirm gate before the overlay tears down (DESIGN.md 5.8).
    canClose: () => {
      if (!dirty || confirming) return true
      confirming = true
      const ok = window.confirm("Discard unsaved changes?")
      confirming = false
      if (ok) markDirty(false)
      return ok
    },
  })

  const save = (): void => {
    if (!editable) return
    saveButton.disabled = true
    saveButton.setAttribute("aria-busy", "true")
    textarea.readOnly = true
    errorLine.hidden = true
    void apiRaw(`/api/files/content?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      body: new TextEncoder().encode(textarea.value),
    })
      .then(() => {
        markDirty(false)
        actions.onToast(`Saved ${name}`, "success")
        overlay.close()
      })
      .catch((error: unknown) => {
        errorLine.hidden = false
        errorLine.textContent =
          error instanceof Error ? error.message : errorMessage(error, "Could not save this file.")
      })
      .finally(() => {
        saveButton.disabled = false
        saveButton.removeAttribute("aria-busy")
        textarea.readOnly = false
      })
  }

  saveButton.addEventListener("click", save)
  cancelButton.addEventListener("click", () => overlay.close())
  panel.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      save()
    }
  })

  if (editable) textarea.focus()
}
