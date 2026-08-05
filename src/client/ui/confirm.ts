import { el } from "./dom.ts"
import { mountOverlay } from "./overlay.ts"

type ConfirmOptions = {
  readonly message: string
  readonly confirmLabel?: string
  readonly background: HTMLElement
  readonly onConfirm: () => void
}

/** DESIGN.md 5.8 `confirm` variant. Destructive actions never fire on first press. */
export function openConfirm(options: ConfirmOptions): void {
  const titleId = "confirm-title"
  const confirmButton = el("button", { class: "btn btn--danger", type: "button" }, [
    options.confirmLabel ?? "Delete",
  ])
  const cancelButton = el("button", { class: "btn btn--secondary", type: "button" }, ["Cancel"])
  const panel = el(
    "div",
    {
      class: "dialog dialog--confirm",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
    },
    [
      el("header", { class: "dialog__header" }, [
        el("h2", { class: "dialog__title", id: titleId }, [
          el("span", { class: "dialog__title-text" }, ["Confirm"]),
        ]),
      ]),
      el("div", { class: "dialog__body dialog__body--pad" }, [options.message]),
      el("footer", { class: "dialog__footer" }, [cancelButton, confirmButton]),
    ],
  )

  const overlay = mountOverlay({
    panel,
    background: options.background,
    onClose: () => undefined,
  })

  cancelButton.addEventListener("click", () => overlay.close())
  confirmButton.addEventListener("click", () => {
    options.onConfirm()
    overlay.close()
  })
  cancelButton.focus()
}
