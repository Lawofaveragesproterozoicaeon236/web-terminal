import { FitAddon, init, Terminal } from "ghostty-web"
import { type SessionId, sessionIdSchema } from "../shared/protocol.ts"
import { type ConnectionState, TerminalConnection } from "./connection.ts"
import { attachImeInputForwarding } from "./ime-input.ts"
import { attachMouseInput } from "./mouse-input.ts"
import { attachTouchScroll } from "./touch-scroll.ts"

type TerminalAppEvents = {
  readonly onState: (state: ConnectionState) => void
  readonly onLatency: (ms: number) => void
  readonly onTitle: (title: string) => void
  readonly onSession: (sessionId: SessionId) => void
}

export type TerminalApp = {
  readonly terminal: Terminal
  readonly connection: TerminalConnection
  readonly fit: () => void
  readonly sendKeys: (data: string) => void
  readonly switchSession: (sessionId: SessionId | undefined) => void
  readonly dispose: () => void
}

const SESSION_STORAGE_KEY = "wt:session-id"
const DEFAULT_FONT_SIZE = 14
const TERMINAL_SCROLLBACK_LINES = 10_000
// Ghostty built-in default face (embedded JetBrains Mono); system mono fallbacks.
const TERMINAL_FONT_FAMILY =
  '"JetBrainsMonoNerdFont", "JetBrains Mono", "SymbolsNerdFontMono", ui-monospace, Menlo, monospace'

export type TerminalTheme = Readonly<Record<string, string>>

async function preloadTerminalFont(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load('14px "JetBrainsMonoNerdFont"'),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 1500)),
    ])
  } catch {
    // font stays on the system fallback; terminal still works
  }
}

export async function createTerminalApp(
  container: HTMLElement,
  theme: TerminalTheme,
  events: TerminalAppEvents,
): Promise<TerminalApp> {
  await init()
  await preloadTerminalFont()
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: TERMINAL_FONT_FAMILY,
    scrollback: TERMINAL_SCROLLBACK_LINES,
    theme,
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)
  fitAddon.fit()
  fitAddon.observeResize()
  // Focus the hidden textarea, not the container: ghostty's focus() targets the
  // contenteditable container whose beforeinput is prevented, which silently drops
  // IME/composed text (Korean). The textarea forwards input correctly.
  const detachTouchScroll = attachTouchScroll(container, {
    onTap: () => terminal.textarea?.focus(),
    isMouseTracking: () => terminal.hasMouseTracking(),
  })
  // Load the Nerd Font async (font-display: swap) so first paint is never blocked,
  // then repaint so PUA glyphs upgrade from the fallback once the face is ready.
  // The initial fit can run before stylesheets apply (wrong container width) and
  // before the webfont swaps in (wrong cell metrics). Refit after first paint and
  // again when every font is ready; both are no-ops when the size already matches.
  requestAnimationFrame(() => fitAddon.fit())
  // ghostty-web's fit() drops calls made within 50ms of a resize (_isResizing
  // lock), which eats the early load-time refits. The final, correct-metrics fit
  // must land after the font swap AND past the lock window.
  void document.fonts.ready.then(() => setTimeout(() => fitAddon.fit(), 120)).catch(() => undefined)
  const detachImeForwarding = attachImeInputForwarding(container, (data) =>
    connection.sendInput(data),
  )
  const detachMouseInput = attachMouseInput(container, terminal, (data) =>
    connection.sendInput(data),
  )

  const connection = new TerminalConnection({
    onOutput: (payload) => terminal.write(payload),
    onReset: () => terminal.write("\u001b[2J\u001b[H"),
    onState: events.onState,
    onLatency: events.onLatency,
    onExit: (code) => terminal.write(`\r\n\u001b[90m[session exited: ${code}]\u001b[0m\r\n`),
    onSession: (sessionId) => {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
      events.onSession(sessionId)
    },
  })

  terminal.onData((data) => connection.sendInput(data))
  terminal.onResize(({ cols, rows }) => connection.sendResize(cols, rows))
  terminal.onTitleChange(events.onTitle)
  window.addEventListener("resize", () => fitAddon.fit())
  const storedSession = sessionIdSchema.safeParse(localStorage.getItem(SESSION_STORAGE_KEY))
  connection.connect(
    terminal.cols,
    terminal.rows,
    storedSession.success ? storedSession.data : undefined,
  )

  return {
    terminal,
    connection,
    fit: () => fitAddon.fit(),
    sendKeys: (data) => connection.sendInput(data),
    switchSession: (sessionId) => {
      terminal.write("\u001b[2J\u001b[H")
      connection.switchSession(sessionId)
    },
    dispose: () => {
      detachMouseInput()
      detachImeForwarding()
      detachTouchScroll()
      connection.close()
      terminal.dispose()
    },
  }
}
