import { apiRaw, apiRequest } from "../api.ts"
import { button, dot, el, errorMessage, iconButton, replace } from "./dom.ts"
import { mountOverlay } from "./overlay.ts"

export type SessionInfo = {
  readonly id: string
  readonly title: string
  readonly cols: number
  readonly rows: number
  readonly createdAt: number
  readonly alive: boolean
  readonly clients: number
}

type ListResponse = { readonly sessions: readonly SessionInfo[] }
type CreateResponse = { readonly session: SessionInfo }

export type SessionPickerActions = {
  readonly background: HTMLElement
  readonly currentSessionId: () => string | undefined
  readonly onAttach: (id: string) => void
  readonly onToast: (message: string, tone: "success" | "error" | "info") => void
}

export function openSessionPicker(actions: SessionPickerActions): void {
  const titleId = "sessions-title"
  const list = el("ul", { class: "list" })
  const body = el("div", { class: "dialog__body" }, [list])
  const newButton = el("button", { class: "btn btn--primary", type: "button" }, ["New session"])
  const closeButton = el("button", { class: "btn btn--secondary", type: "button" }, ["Close"])

  const panel = el(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    [
      el("header", { class: "dialog__header" }, [
        el("h2", { class: "dialog__title", id: titleId }, [
          el("span", { class: "dialog__title-text" }, ["Sessions"]),
        ]),
      ]),
      body,
      el("footer", { class: "dialog__footer" }, [closeButton, newButton]),
    ],
  )

  const overlay = mountOverlay({
    panel,
    background: actions.background,
    onClose: () => undefined,
  })

  const showEmpty = (): void => {
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["No live sessions."]),
        el("p", { class: "empty__hint" }, ["Start a new session to begin."]),
      ]),
    ])
  }

  const rowFor = (session: SessionInfo): HTMLElement => {
    const current = session.id === actions.currentSessionId()
    const label = session.title === "" ? session.id.slice(0, 8) : session.title
    const main = button(
      { class: "row", ...(current ? { "aria-current": "true" } : {}) },
      [
        el("span", { class: "row__lead" }, [
          dot(session.alive ? "connected" : "idle", session.alive ? "Alive" : "Stopped"),
        ]),
        el("span", { class: "row__label", title: label }, [label]),
        el("span", { class: "row__meta" }, [`${session.clients}c`]),
      ],
      () => {
        actions.onAttach(session.id)
        overlay.close()
      },
    )
    const kill = iconButton(
      `Kill ${label}`,
      "\u2715",
      "danger",
      () => void remove(session.id, label),
    )
    return el("li", { class: "list__item" }, [main, el("span", { class: "row__actions" }, [kill])])
  }

  async function remove(id: string, label: string): Promise<void> {
    try {
      await apiRaw(`/api/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      actions.onToast(`Killed ${label}`, "success")
      load()
    } catch (error) {
      actions.onToast(errorMessage(error, "Could not kill session"), "error")
    }
  }

  function load(): void {
    void apiRequest<ListResponse>("/api/sessions")
      .then((data) => {
        if (data.sessions.length === 0) {
          showEmpty()
          return
        }
        replace(list, data.sessions.map(rowFor))
        replace(body, [list])
      })
      .catch((error: unknown) => {
        actions.onToast(errorMessage(error, "Could not list sessions"), "error")
      })
  }

  newButton.addEventListener("click", () => {
    newButton.disabled = true
    void apiRequest<CreateResponse>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((data) => {
        actions.onAttach(data.session.id)
        actions.onToast("Started a new session", "success")
        overlay.close()
      })
      .catch((error: unknown) => {
        actions.onToast(errorMessage(error, "Could not create session"), "error")
        newButton.disabled = false
      })
  })

  closeButton.addEventListener("click", () => overlay.close())
  load()
}
