import { existsSync } from "node:fs"
import { DEFAULT_TERMINAL_DIMENSIONS, type SessionId, sessionIdSchema } from "../shared/protocol.ts"
import { type PtyHandle, type PtyOptions, spawnPty } from "./pty.ts"
import { ReplayBuffer } from "./replay-buffer.ts"

const BUFFER_CAPACITY_BYTES = 4 * 1024 * 1024
const FLUSH_INTERVAL_MS = 8
const FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/bin/sh"] as const

/**
 * Default session command. fish blocks on terminal capability queries (DA/DCS)
 * that ghostty-web does not answer, producing a blank terminal. The default must
 * therefore never resolve to fish. Precedence: WT_SHELL override → the user's
 * $SHELL unless it is fish → first available of zsh/bash/sh.
 */
export function defaultCommand(): readonly string[] {
  const override = process.env["WT_SHELL"]
  if (override !== undefined && override !== "") return [override, "-l"]
  const loginShell = process.env["SHELL"]
  if (loginShell !== undefined && loginShell !== "" && !loginShell.endsWith("fish")) {
    return [loginShell, "-l"]
  }
  for (const candidate of FALLBACK_SHELLS) {
    if (existsSync(candidate)) return [candidate, "-l"]
  }
  return ["/bin/sh", "-l"]
}

export type SessionInfo = {
  readonly id: SessionId
  readonly title: string
  readonly cols: number
  readonly rows: number
  readonly createdAt: number
  readonly alive: boolean
  readonly clients: number
}

type OutputListener = (offset: number, payload: Uint8Array) => void
type ExitListener = (code: number) => void

type CreateSessionOptions = Partial<PtyOptions> & { readonly title?: string }

type Listener = { readonly onOutput: OutputListener; readonly onExit: ExitListener }

export class TerminalSession {
  readonly id: SessionId
  readonly buffer = new ReplayBuffer(BUFFER_CAPACITY_BYTES)
  readonly #title: string
  readonly #createdAt = Date.now()
  readonly #listeners = new Set<Listener>()
  readonly #pty: PtyHandle
  #cols: number
  #rows: number
  #pending: Uint8Array[] = []
  #flushTimer: ReturnType<typeof setTimeout> | undefined
  #exitCode: number | undefined

  constructor(id: SessionId, options: CreateSessionOptions) {
    this.id = id
    this.#title = options.title ?? "shell"
    this.#cols = options.cols ?? DEFAULT_TERMINAL_DIMENSIONS.cols
    this.#rows = options.rows ?? DEFAULT_TERMINAL_DIMENSIONS.rows
    const ptyOptions: PtyOptions = {
      command: options.command ?? defaultCommand(),
      cols: this.#cols,
      rows: this.#rows,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
    }
    this.#pty = spawnPty(ptyOptions, {
      onData: (chunk) => this.#enqueue(chunk),
      onExit: (code) => this.#handleExit(code),
    })
  }

  attach(onOutput: OutputListener, onExit: ExitListener): () => void {
    const listener: Listener = { onOutput, onExit }
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  write(data: string | Uint8Array): void {
    if (this.#exitCode === undefined) this.#pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.#cols = cols
    this.#rows = rows
    if (this.#exitCode === undefined) this.#pty.resize(cols, rows)
  }

  kill(): void {
    this.#pty.kill()
  }

  info(): SessionInfo {
    return {
      id: this.id,
      title: this.#title,
      cols: this.#cols,
      rows: this.#rows,
      createdAt: this.#createdAt,
      alive: this.#exitCode === undefined,
      clients: this.#listeners.size,
    }
  }

  #enqueue(chunk: Uint8Array): void {
    this.#pending.push(chunk.slice())
    if (this.#flushTimer === undefined) {
      this.#flushTimer = setTimeout(() => this.#flush(), FLUSH_INTERVAL_MS)
    }
  }

  #flush(): void {
    this.#flushTimer = undefined
    if (this.#pending.length === 0) return
    const total = this.#pending.reduce((sum, c) => sum + c.length, 0)
    const payload = new Uint8Array(total)
    let cursor = 0
    for (const chunk of this.#pending) {
      payload.set(chunk, cursor)
      cursor += chunk.length
    }
    this.#pending = []
    const offset = this.buffer.endOffset
    this.buffer.append(payload)
    for (const listener of this.#listeners) listener.onOutput(offset, payload)
  }

  #handleExit(code: number): void {
    this.#flush()
    this.#exitCode = code
    for (const listener of this.#listeners) listener.onExit(code)
  }
}

export class SessionStore {
  readonly #sessions = new Map<SessionId, TerminalSession>()

  create(options: CreateSessionOptions = {}): TerminalSession {
    const id = sessionIdSchema.parse(crypto.randomUUID())
    const session = new TerminalSession(id, options)
    this.#sessions.set(id, session)
    return session
  }

  get(id: SessionId): TerminalSession | undefined {
    return this.#sessions.get(id)
  }

  list(): readonly SessionInfo[] {
    return [...this.#sessions.values()].map((session) => session.info())
  }

  remove(id: SessionId): void {
    const session = this.#sessions.get(id)
    if (session === undefined) return
    session.kill()
    this.#sessions.delete(id)
  }
}
