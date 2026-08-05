import { z } from "zod"
import { apiRequest } from "../api.ts"
import { dot, el, replace } from "./dom.ts"

const workspaceSchema = z
  .object({
    workspace_id: z.string(),
    number: z.number(),
    label: z.string(),
    focused: z.boolean(),
    pane_count: z.number(),
    tab_count: z.number(),
    agent_status: z.string(),
  })
  .readonly()

const agentSchema = z.record(z.string(), z.unknown()).readonly()
const snapshotSchema = z
  .object({
    status: z.string(),
    snapshot: z
      .object({
        version: z.string(),
        workspaces: z.array(workspaceSchema).readonly().optional(),
        agents: z.array(agentSchema).readonly().optional(),
      })
      .readonly()
      .optional(),
  })
  .readonly()

type Workspace = z.infer<typeof workspaceSchema>
type Snapshot = z.infer<typeof snapshotSchema>

export type HerdrPanel = {
  readonly element: HTMLElement
  /** Polling runs only while the tab is visible (task + DESIGN.md 6.2). */
  readonly setVisible: (visible: boolean) => void
  readonly dispose: () => void
}

const POLL_MS = 5000

/** Map herdr's free-form agent_status onto the four DESIGN.md 5.5 dot states. */
function statusState(status: string): string {
  const value = status.toLowerCase()
  if (value.includes("run") || value.includes("active") || value.includes("busy")) {
    return "connected"
  }
  if (value.includes("wait") || value.includes("pend") || value.includes("start")) {
    return "reconnecting"
  }
  if (value.includes("err") || value.includes("fail") || value.includes("dead")) return "offline"
  return "idle"
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function agentRow(agent: Readonly<Record<string, unknown>>, index: number): HTMLElement {
  const name = readString(agent, "name") ?? readString(agent, "agent_id") ?? `Agent ${index + 1}`
  const status = readString(agent, "status") ?? "unknown"
  return el("li", { class: "list__item" }, [
    el("div", { class: "row" }, [
      el("span", { class: "row__lead" }, [dot(statusState(status), status)]),
      el("span", { class: "row__label", title: name }, [name]),
      el("span", { class: "row__meta" }, [status]),
    ]),
  ])
}

function workspaceRow(workspace: Workspace): HTMLElement {
  const meta = `${workspace.pane_count}p ${workspace.tab_count}t`
  return el("li", { class: "list__item" }, [
    el("div", { class: "row", ...(workspace.focused ? { "aria-current": "true" } : {}) }, [
      el("span", { class: "row__lead" }, [
        dot(statusState(workspace.agent_status), workspace.agent_status),
      ]),
      el("span", { class: "row__label", title: workspace.label }, [
        `${workspace.number}. ${workspace.label}`,
      ]),
      el("span", { class: "row__meta" }, [meta]),
    ]),
  ])
}

function sectionHeading(text: string): HTMLElement {
  return el("div", { class: "panel" }, [el("h3", { class: "sidebar__title" }, [text])])
}

export function createHerdrPanel(): HerdrPanel {
  const body = el("div", { class: "scroll-body" })
  const element = el("div", { class: "stack" }, [body])
  let timer: ReturnType<typeof setInterval> | undefined
  let visible = false

  const showUnavailable = (): void => {
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["herdr is unavailable."]),
        el("p", { class: "empty__hint" }, ["Start the herdr server to see workspaces and agents."]),
      ]),
    ])
  }

  const render = (data: Snapshot): void => {
    const workspaces = data.snapshot?.workspaces ?? []
    const agents = data.snapshot?.agents ?? []
    if (workspaces.length === 0 && agents.length === 0) {
      replace(body, [
        el("div", { class: "empty" }, [
          el("p", { class: "empty__title" }, ["No active workspaces."]),
          el("p", { class: "empty__hint" }, ["Agents will appear here when they start."]),
        ]),
      ])
      return
    }
    const nodes: HTMLElement[] = []
    if (workspaces.length > 0) {
      nodes.push(sectionHeading("Workspaces"))
      nodes.push(el("ul", { class: "list" }, workspaces.map(workspaceRow)))
    }
    if (agents.length > 0) {
      nodes.push(sectionHeading("Agents"))
      nodes.push(el("ul", { class: "list" }, agents.map(agentRow)))
    }
    replace(body, nodes)
  }

  const poll = (): void => {
    void apiRequest("/api/herdr/snapshot", { schema: snapshotSchema })
      .then(render)
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
        showUnavailable()
      })
  }

  return {
    element,
    setVisible: (next) => {
      if (next === visible) return
      visible = next
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      if (!visible) return
      poll()
      timer = setInterval(poll, POLL_MS)
    },
    dispose: () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
  }
}
