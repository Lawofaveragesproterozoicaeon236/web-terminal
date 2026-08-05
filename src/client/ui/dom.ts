type Attrs = Readonly<Record<string, string | number | boolean | undefined>>

type Child = Node | string

const ICON_PATHS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  download: "M12 3v12m-5-5 5 5 5-5M5 21h14",
  edit: "M4 20h4L19 9l-4-4L4 16v4M13.5 6.5l4 4",
  file: "M6 2h8l4 4v16H6zM14 2v6h6",
  folder: "M3 6h7l2 2h9v12H3z",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  "arrow-down": "M12 5v14m6-6-6 6-6-6",
  "arrow-left": "M19 12H5m6-6-6 6 6 6",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
} as const

export type IconName = keyof typeof ICON_PATHS

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    node.setAttribute(name, value === true ? "" : String(value))
  }
}

function appendAll(node: Node, children: readonly Child[]): void {
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child)
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  applyAttrs(node, attrs)
  appendAll(node, children)
  return node
}

export function replace(parent: Element, children: readonly Child[]): void {
  parent.replaceChildren()
  appendAll(parent, children)
}

export function icon(name: IconName): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(namespace, "svg")
  applyAttrs(svg, {
    class: "icon",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  })
  const path = document.createElementNS(namespace, "path")
  applyAttrs(path, { class: "icon__path", d: ICON_PATHS[name] })
  svg.appendChild(path)
  return svg
}

export function dot(state: string, label: string): HTMLSpanElement {
  return el("span", { class: "dot", "data-state": state, role: "img", "aria-label": label })
}

export function button(
  attrs: Attrs,
  children: readonly Child[],
  onClick: () => void,
): HTMLButtonElement {
  const node = el("button", { type: "button", ...attrs }, children)
  node.addEventListener("click", onClick)
  return node
}

export function iconButton(
  label: string,
  iconName: IconName,
  tone: "default" | "danger",
  onClick: () => void,
): HTMLButtonElement {
  return button(
    { class: "row-action", "aria-label": label, title: label, "data-tone": tone },
    [icon(iconName)],
    onClick,
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ["K", "M", "G", "T"] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit] ?? ""}`
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string" && error !== "") return error
  return fallback
}
