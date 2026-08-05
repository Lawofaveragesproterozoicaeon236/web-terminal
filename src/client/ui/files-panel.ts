import { apiRaw, apiRequest } from "../api.ts"
import { button, el, errorMessage, formatBytes, iconButton, replace } from "./dom.ts"

export type DirEntry = {
  readonly name: string
  readonly kind: "file" | "directory" | "other"
  readonly size: number
  readonly mtimeMs: number
}

type ListResponse = { readonly path: string; readonly entries: readonly DirEntry[] }

export type FilesPanel = {
  readonly element: HTMLElement
  readonly refresh: () => void
}

export type FilesPanelActions = {
  readonly onToast: (message: string, tone: "success" | "error" | "info") => void
  readonly onEdit: (path: string, name: string) => void
  readonly onConfirm: (message: string, onYes: () => void) => void
}

const joinPath = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`)
const parentOf = (dir: string): string => dir.split("/").slice(0, -1).join("/")

export function createFilesPanel(actions: FilesPanelActions): FilesPanel {
  const breadcrumbPath = el("span", { class: "breadcrumb__path" }, ["~"])
  const breadcrumb = el("div", { class: "breadcrumb" }, [breadcrumbPath])
  const list = el("ul", { class: "list" })
  const body = el("div", { class: "scroll-body" }, [list])
  const fileInput = el("input", { type: "file", hidden: true, multiple: true })

  const uploadButton = button({ class: "btn btn--secondary" }, ["Upload"], () => fileInput.click())
  const header = el("div", { class: "panel cluster" }, [uploadButton])
  const element = el("div", { class: "stack" }, [breadcrumb, header, body])

  let cwd = ""

  const showEmpty = (): void => {
    replace(list, [])
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["No files here."]),
        el("p", { class: "empty__hint" }, ["Upload a file to get started."]),
      ]),
    ])
  }

  const showError = (message: string): void => {
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["Could not read this folder."]),
        el("p", { class: "empty__hint" }, [message]),
      ]),
    ])
  }

  const rowFor = (entry: DirEntry): HTMLElement => {
    const full = joinPath(cwd, entry.name)
    const isDir = entry.kind === "directory"
    const label = el("span", { class: "row__label", title: entry.name }, [entry.name])
    const lead = el("span", { class: "row__lead", "aria-hidden": "true" }, [isDir ? "/" : "\u00b7"])
    const meta = el("span", { class: "row__meta" }, [isDir ? "" : formatBytes(entry.size)])

    const main = isDir
      ? button({ class: "row", "aria-expanded": "false" }, [lead, label, meta], () => {
          cwd = full
          load()
        })
      : button({ class: "row" }, [lead, label, meta], () => actions.onEdit(full, entry.name))

    const actionNodes: HTMLElement[] = []
    if (!isDir) {
      const href = `/api/files/content?path=${encodeURIComponent(full)}&download=1`
      const download = el(
        "a",
        {
          class: "row-action",
          href,
          download: entry.name,
          "aria-label": `Download ${entry.name}`,
          title: "Download",
        },
        ["\u2193"],
      )
      actionNodes.push(download)
      actionNodes.push(
        // U+FE0E forces text presentation; the bare pencil renders as emoji on Apple.
        iconButton(`Edit ${entry.name}`, "\u270f\ufe0e", "default", () =>
          actions.onEdit(full, entry.name),
        ),
      )
    }
    actionNodes.push(
      iconButton(`Delete ${entry.name}`, "\u2715", "danger", () => {
        actions.onConfirm(`Delete ${entry.name}?`, () => void remove(full, entry.name))
      }),
    )

    return el("li", { class: "list__item" }, [
      main,
      el("span", { class: "row__actions" }, actionNodes),
    ])
  }

  async function remove(path: string, name: string): Promise<void> {
    try {
      await apiRaw(`/api/files/content?path=${encodeURIComponent(path)}`, { method: "DELETE" })
      actions.onToast(`Deleted ${name}`, "success")
      load()
    } catch (error) {
      actions.onToast(errorMessage(error, `Could not delete ${name}`), "error")
    }
  }

  async function upload(files: readonly File[]): Promise<void> {
    for (const file of files) {
      try {
        const target = joinPath(cwd, file.name)
        await apiRaw(`/api/files/content?path=${encodeURIComponent(target)}`, {
          method: "PUT",
          body: await file.arrayBuffer(),
        })
        actions.onToast(`Uploaded ${file.name}`, "success")
      } catch (error) {
        actions.onToast(errorMessage(error, `Could not upload ${file.name}`), "error")
      }
    }
    load()
  }

  fileInput.addEventListener("change", () => {
    const picked = fileInput.files
    if (picked === null || picked.length === 0) return
    void upload([...picked]).finally(() => {
      fileInput.value = ""
    })
  })

  function load(): void {
    breadcrumbPath.textContent = cwd === "" ? "~" : `~/${cwd}`
    breadcrumbPath.title = breadcrumbPath.textContent
    void apiRequest<ListResponse>(`/api/files?path=${encodeURIComponent(cwd)}`)
      .then((data) => {
        const rows: HTMLElement[] = []
        if (cwd !== "") {
          rows.push(
            el("li", { class: "list__item" }, [
              button(
                { class: "row" },
                [
                  el("span", { class: "row__lead", "aria-hidden": "true" }, [".."]),
                  el("span", { class: "row__label" }, ["Parent folder"]),
                ],
                () => {
                  cwd = parentOf(cwd)
                  load()
                },
              ),
            ]),
          )
        }
        if (data.entries.length === 0 && cwd === "") {
          showEmpty()
          return
        }
        for (const entry of data.entries) rows.push(rowFor(entry))
        replace(list, rows)
        replace(body, [list])
      })
      .catch((error: unknown) => showError(errorMessage(error, "Unknown error")))
  }

  element.appendChild(fileInput)
  load()
  return { element, refresh: load }
}
