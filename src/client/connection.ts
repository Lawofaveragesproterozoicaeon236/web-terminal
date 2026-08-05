import { encodeInput, OPCODE } from "../shared/protocol.ts"

const MAX_BACKOFF_MS = 15_000
const PING_INTERVAL_MS = 15_000

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "closed"

export type ConnectionEvents = {
  readonly onOutput: (payload: Uint8Array) => void
  readonly onReset: () => void
  readonly onState: (state: ConnectionState) => void
  readonly onExit: (code: number) => void
  readonly onLatency: (ms: number) => void
  readonly onSession: (sessionId: string) => void
}

type ServerMessage =
  | { readonly t: "welcome"; readonly sessionId: string; readonly offset: number }
  | { readonly t: "reset"; readonly offset: number }
  | { readonly t: "pong" }
  | { readonly t: "exit"; readonly code: number }
  | { readonly t: "error"; readonly message: string }

export class TerminalConnection {
  #ws: WebSocket | undefined
  #sessionId: string | undefined
  #offset = 0
  #attempts = 0
  #closed = false
  #pingTimer: ReturnType<typeof setInterval> | undefined
  #pingSentAt = 0
  #cols = 80
  #rows = 24
  readonly #events: ConnectionEvents

  constructor(events: ConnectionEvents) {
    this.#events = events
  }

  connect(cols: number, rows: number): void {
    this.#cols = cols
    this.#rows = rows
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

  get sessionId(): string | undefined {
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
        this.#handleControl(JSON.parse(event.data) as ServerMessage)
      } else {
        this.#handleBinary(new Uint8Array(event.data))
      }
    }
    ws.onclose = () => {
      this.#stopPing()
      if (this.#closed) return
      const backoff =
        Math.min(MAX_BACKOFF_MS, 300 * 2 ** this.#attempts) * (0.7 + Math.random() * 0.6)
      this.#attempts += 1
      this.#events.onState("reconnecting")
      setTimeout(() => {
        if (!this.#closed) this.#open()
      }, backoff)
    }
  }

  #handleControl(message: ServerMessage): void {
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
        this.#events.onLatency(Date.now() - this.#pingSentAt)
        return
      case "exit":
        this.#events.onExit(message.code)
        return
      case "error":
        console.error("server protocol error:", message.message)
        return
    }
  }

  #handleBinary(data: Uint8Array): void {
    const opcode = data[0]
    if (opcode !== OPCODE.output || data.length < 9) return
    const view = new DataView(data.buffer, data.byteOffset + 1, 8)
    const frameOffset = Number(view.getBigUint64(0))
    const payload = data.subarray(9)
    if (frameOffset > this.#offset) return
    const skip = this.#offset - frameOffset
    if (skip >= payload.length) return
    const fresh = payload.subarray(skip)
    this.#offset += fresh.length
    this.#events.onOutput(fresh)
  }

  #startPing(): void {
    this.#stopPing()
    this.#pingTimer = setInterval(() => {
      if (this.#ws?.readyState === WebSocket.OPEN) {
        this.#pingSentAt = Date.now()
        this.#ws.send(JSON.stringify({ t: "ping" }))
      }
    }, PING_INTERVAL_MS)
  }

  #stopPing(): void {
    if (this.#pingTimer !== undefined) clearInterval(this.#pingTimer)
    this.#pingTimer = undefined
  }
}
