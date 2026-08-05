/** Typed DOM builders. Keeps every UI module free of `as` assertions. */

type Attrs = Readonly<Record<string, string | number | boolean | undefined>>

export type Child = Node | string

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

/** Create an element with attributes and children, typed by tag name. */
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

/** Replace every child of `parent` with `children`. */
export function replace(parent: Element, children: readonly Child[]): void {
  parent.replaceChildren()
  appendAll(parent, children)
}

export function clear(parent: Element): void {
  parent.replaceChildren()
}

/** A status dot paired with a text label, per DESIGN.md 5.5. */
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
  glyph: string,
  tone: "default" | "danger",
  onClick: () => void,
): HTMLButtonElement {
  return button(
    { class: "row-action", "aria-label": label, title: label, "data-tone": tone },
    [glyph],
    onClick,
  )
}

/** Format a byte count for a list row's mono meta slot. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ["K", "M", "G", "T"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit] ?? ""}`
}

/** Extract a human message from an unknown thrown value. Every catch narrows. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string" && error !== "") return error
  return fallback
}
