/**
 * SGR 1006 mouse event encoding for terminal input. Coordinates are 1-based cell
 * positions; the caller translates pixels to cells.
 */

export type MouseButton = "left" | "middle" | "right" | "wheel-up" | "wheel-down"

export type MouseModifiers = {
  readonly shift?: boolean
  readonly alt?: boolean
  readonly ctrl?: boolean
}

const BUTTON_CODE: Readonly<Record<MouseButton, number>> = {
  left: 0,
  middle: 1,
  right: 2,
  "wheel-up": 64,
  "wheel-down": 65,
}

function modifierBits(mods: MouseModifiers): number {
  return (mods.shift === true ? 4 : 0) | (mods.alt === true ? 8 : 0) | (mods.ctrl === true ? 16 : 0)
}

/** Press or release. SGR format: ESC [ < Cb ; Cx ; Cy M (press) / m (release). */
export function encodeMouseClick(
  button: MouseButton,
  action: "press" | "release",
  col: number,
  row: number,
  mods: MouseModifiers = {},
): string {
  const cb = BUTTON_CODE[button] + modifierBits(mods)
  const suffix = action === "press" ? "M" : "m"
  return `\u001b[<${cb};${col + 1};${row + 1}${suffix}`
}

/** Motion while a button is held (mode 1002) or any motion (mode 1003). */
export function encodeMouseMotion(
  button: MouseButton | "none",
  col: number,
  row: number,
  mods: MouseModifiers = {},
): string {
  const base = button === "none" ? 3 : BUTTON_CODE[button]
  const cb = base + 32 + modifierBits(mods)
  return `\u001b[<${cb};${col + 1};${row + 1}M`
}
