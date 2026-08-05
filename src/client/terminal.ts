import { FitAddon, init, Terminal } from "ghostty-web"
import { type ConnectionState, TerminalConnection } from "./connection.ts"

export type TerminalAppEvents = {
  readonly onState: (state: ConnectionState) => void
  readonly onLatency: (ms: number) => void
  readonly onTitle: (title: string) => void
  readonly onSession: (sessionId: string) => void
}

export type TerminalApp = {
  readonly terminal: Terminal
  readonly connection: TerminalConnection
  readonly fit: () => void
  readonly sendKeys: (data: string) => void
  readonly switchSession: (sessionId: string | undefined) => void
  readonly dispose: () => void
}

const SESSION_STORAGE_KEY = "wt:session-id"

export type TerminalTheme = Readonly<Record<string, string>>

export async function createTerminalApp(
  container: HTMLElement,
  theme: TerminalTheme,
  events: TerminalAppEvents,
): Promise<TerminalApp> {
  await init()
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    scrollback: 10_000,
    theme,
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)
  fitAddon.fit()
  fitAddon.observeResize()

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
  const storedSession = localStorage.getItem(SESSION_STORAGE_KEY) ?? undefined
  connection.connect(terminal.cols, terminal.rows, storedSession)

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
      connection.close()
      terminal.dispose()
    },
  }
}
