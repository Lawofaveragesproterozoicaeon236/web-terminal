import type { TerminalTheme } from "../terminal.ts"

/**
 * The ghostty-web / xterm ITheme object from DESIGN.md 2.3.
 * This is the fidelity contract: these strings mirror the Section 2.2 terminal
 * tokens in styles.css. Changing one without the other is a defect.
 */
export const terminalTheme: TerminalTheme = {
  background: "#050607",
  foreground: "#D6DAE0",
  cursor: "#5AB2FF",
  cursorAccent: "#050607",
  selectionBackground: "rgba(90, 178, 255, 0.30)",
  selectionForeground: "#F2F3F5",
  selectionInactiveBackground: "rgba(255, 255, 255, 0.12)",
  scrollbarSliderBackground: "rgba(255, 255, 255, 0.14)",
  scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.22)",
  scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.30)",
  black: "#15181B",
  red: "#F4736F",
  green: "#5FD68A",
  yellow: "#E7B455",
  blue: "#6AABF0",
  magenta: "#C79AF0",
  cyan: "#5FC9D6",
  white: "#C3C8CE",
  brightBlack: "#787F87",
  brightRed: "#FF9490",
  brightGreen: "#88E9AA",
  brightYellow: "#F7CE7A",
  brightBlue: "#93C6F7",
  brightMagenta: "#DCBBF8",
  brightCyan: "#8CDEE8",
  brightWhite: "#F2F3F5",
}

/** DESIGN.md 3.2: terminal cell size drops one step below --bp-md. */
export const terminalFontSize = (): number => (window.innerWidth < 768 ? 13 : 14)

export const MOBILE_BREAKPOINT = 768

export const isMobile = (): boolean => window.innerWidth < MOBILE_BREAKPOINT
