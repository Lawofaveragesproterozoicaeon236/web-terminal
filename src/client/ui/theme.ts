const MOBILE_BREAKPOINT_PX = 768

export function isMobile(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX
}

export function terminalFontSize(): number {
  return isMobile() ? 13 : 14
}

/** Mirrors the local Ghostty terminal's built-in defaults (empty config) — bg #282C34, fg #FFFFFF, Tomorrow Night ANSI palette. */
export const terminalTheme = {
  background: "#282C34",
  foreground: "#FFFFFF",
  cursor: "#FFFFFF",
  cursorAccent: "#282C34",
  selectionBackground: "#FFFFFF",
  selectionForeground: "#282C34",
  black: "#1D1F21",
  red: "#CC6666",
  green: "#B5BD68",
  yellow: "#F0C674",
  blue: "#81A2BE",
  magenta: "#B294BB",
  cyan: "#8ABEB7",
  white: "#C5C8C6",
  brightBlack: "#666666",
  brightRed: "#D54E53",
  brightGreen: "#B9CA4A",
  brightYellow: "#E7C547",
  brightBlue: "#7AA6DA",
  brightMagenta: "#C397D8",
  brightCyan: "#70C0B1",
  brightWhite: "#EAEAEA",
} as const

/** Ghostty built-in default face/size/cursor. */
export const GHOSTTY_FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, monospace'
export const GHOSTTY_FONT_SIZE_PX = 13
export const GHOSTTY_CURSOR_STYLE = "block" as const
export const GHOSTTY_CURSOR_BLINK = true
