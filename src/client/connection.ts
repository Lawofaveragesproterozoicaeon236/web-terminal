import { assertNever } from "../shared/assert-never.ts"
import {
  type BinaryFrame,
  DEFAULT_TERMINAL_DIMENSIONS,
  decodeBinaryFrame,
  encodeInput,
  ProtocolError,
  parseServerControl,
  type ServerControl,
  type SessionId,
} from "../shared/protocol.ts"

const MAX_BACKOFF_MS = 15_000
const INITIAL_BACKOFF_MS = 300
const BACKOFF_JITTER_MIN = 0.7
const BACKOFF_JITTER_RANGE = 0.6
const PING_INTERVAL_MS = 15_000
const PONG_TIMEOUT_MS = 45_000

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "closed"

type ConnectionEvents = {
  readonly onOutput: (payload: Uint8Array) => void
  readonly onReset: () => void
  readonly onState: (state: ConnectionState) => void
  readonly onExit: (code: number) => void
  readonly onLatency: (ms: number) => void
  readonly onSession: (sessionId: SessionId) => void
}

export class TerminalConnection {
  #ws: WebSocket | undefined
  #sessionId: SessionId | undefined
  #offset = 0
  #attempts = 0
  #closed = false
  #pingTimer: ReturnType<typeof setInterval> | undefined
  #pingSentAt = 0
  #lastPongAt = 0
  #cols: number = DEFAULT_TERMINAL_DIMENSIONS.cols
  #rows: number = DEFAULT_TERMINAL_DIMENSIONS.rows
  readonly #events: ConnectionEvents

  constructor(events: ConnectionEvents) {
    this.#events = events
  }

  connect(cols: number, rows: number, sessionId?: SessionId): void {
    this.#cols = cols
    this.#rows = rows
    if (sessionId !== undefined) this.#sessionId = sessionId
    this.#open()
  }

  /** Detach from the current session and attach to another (undefined = fresh session). */
  switchSession(sessionId: SessionId | undefined): void {
    this.#sessionId = sessionId
    this.#offset = 0
    this.#attempts = 0
    const ws = this.#ws
    this.#ws = undefined
    if (ws !== undefined) {
      ws.onclose = null
      ws.close()
    }
    this.#stopPing()
    this.#open()
  }

  sendInput(data: string): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(encodeInput(new TextEncoder().encode(data)))
    }
  }

  sendResize(cols: number, rows: number): void {
    this.#cols = cols
    this.#rows = rows
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify({ t: "resize", cols, rows }))
    }
  }

  close(): void {
    this.#closed = true
    this.#stopPing()
    this.#ws?.close()
    this.#events.onState("closed")
  }

  get sessionId(): SessionId | undefined {
    return this.#sessionId
  }

  #open(): void {
    this.#events.onState(this.#attempts === 0 ? "connecting" : "reconnecting")
    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.binaryType = "arraybuffer"
    this.#ws = ws
    ws.onopen = () => {
      const hello: Record<string, unknown> = { t: "hello", cols: this.#cols, rows: this.#rows }
      if (this.#sessionId !== undefined) {
        hello["sessionId"] = this.#sessionId
        hello["lastOffset"] = this.#offset
      }
      ws.send(JSON.stringify(hello))
      this.#startPing()
    }
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === "string") {
        this.#handleControl(parseServerControl(event.data))
      } else {
        this.#handleBinary(new Uint8Array(event.data))
      }
    }
    ws.onclose = () => {
      this.#stopPing()
      if (this.#closed) return
      const backoff =
        Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** this.#attempts) *
        (BACKOFF_JITTER_MIN + Math.random() * BACKOFF_JITTER_RANGE)
      this.#attempts += 1
      this.#events.onState("reconnecting")
      setTimeout(() => {
        if (!this.#closed) this.#open()
      }, backoff)
    }
  }

  #handleControl(message: ServerControl): void {
    switch (message.t) {
      case "welcome":
        this.#sessionId = message.sessionId
        this.#offset = message.offset
        this.#attempts = 0
        this.#events.onSession(message.sessionId)
        this.#events.onState("connected")
        return
      case "reset":
        this.#offset = message.offset
        this.#events.onReset()
        return
      case "pong":
        this.#lastPongAt = Date.now()
        this.#events.onLatency(this.#lastPongAt - this.#pingSentAt)
        return
      case "exit":
        this.#events.onExit(message.code)
        return
      case "error":
        console.error("server protocol error:", message.message)
        return
      default:
        assertNever(message)
    }
  }

  #handleBinary(data: Uint8Array): void {
    let frame: BinaryFrame
    try {
      frame = decodeBinaryFrame(data)
    } catch (error) {
      if (error instanceof ProtocolError) return
      throw error
    }
    if (frame.kind !== "output") return
    const frameOffset = frame.offset
    const payload = frame.payload
    if (frameOffset > this.#offset) return
    const skip = this.#offset - frameOffset
    if (skip >= payload.length) return
    const fresh = payload.subarray(skip)
    this.#offset += fresh.length
    this.#events.onOutput(fresh)
  }

  #startPing(): void {
    this.#stopPing()
    this.#lastPongAt = Date.now()
    this.#pingTimer = setInterval(() => {
      const ws = this.#ws
      if (ws?.readyState !== WebSocket.OPEN) return
      // Liveness: a blackholed socket never fires onclose, so force it closed when
      // pongs stop arriving. The close handler then drives the reconnect backoff.
      if (Date.now() - this.#lastPongAt > PONG_TIMEOUT_MS) {
        ws.close()
        return
      }
      this.#pingSentAt = Date.now()
      ws.send(JSON.stringify({ t: "ping" }))
    }, PING_INTERVAL_MS)
  }

  #stopPing(): void {
    if (this.#pingTimer !== undefined) clearInterval(this.#pingTimer)
    this.#pingTimer = undefined
  }
}
