const MOBILE_BREAKPOINT_PX = 768

export function isMobile(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX
}

export function terminalFontSize(): number {
  return isMobile() ? 14 : 16
}

/** Transcribed from the local Ghostty config's `theme = Nord` (Ghostty.app themes/Nord). */
export const terminalTheme = {
  background: "#2E3440",
  foreground: "#D8DEE9",
  cursor: "#ECEFF4",
  cursorAccent: "#282828",
  selectionBackground: "#ECEFF4",
  selectionForeground: "#4C566A",
  black: "#3B4252",
  red: "#BF616A",
  green: "#A3BE8C",
  yellow: "#EBCB8B",
  blue: "#81A1C1",
  magenta: "#B48EAD",
  cyan: "#88C0D0",
  white: "#E5E9F0",
  brightBlack: "#596377",
  brightRed: "#BF616A",
  brightGreen: "#A3BE8C",
  brightYellow: "#EBCB8B",
  brightBlue: "#81A1C1",
  brightMagenta: "#B48EAD",
  brightCyan: "#8FBCBB",
  brightWhite: "#ECEFF4",
} as const

/** Mirrors the local Ghostty config's font-family / font-size. */
export const GHOSTTY_FONT_FAMILY = '"GeistMono", ui-monospace, Menlo, monospace'
export const GHOSTTY_FONT_SIZE_PX = 16
export const GHOSTTY_CURSOR_STYLE = "block" as const
export const GHOSTTY_CURSOR_BLINK = true
