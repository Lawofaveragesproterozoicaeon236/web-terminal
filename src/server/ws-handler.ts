import type { ServerWebSocket } from "bun"
import {
  decodeBinaryFrame,
  encodeOutput,
  ProtocolError,
  parseClientControl,
  type ServerControl,
} from "../shared/protocol.ts"
import type { SessionStore, TerminalSession } from "./session-store.ts"

export type WsData = {
  detach: (() => void) | undefined
  session: TerminalSession | undefined
}

function sendControl(ws: ServerWebSocket<WsData>, message: ServerControl): void {
  ws.send(JSON.stringify(message))
}

function attachSession(ws: ServerWebSocket<WsData>, session: TerminalSession): void {
  ws.data.session = session
  ws.data.detach = session.attach(
    (offset, payload) => {
      ws.send(encodeOutput(offset, payload))
    },
    (code) => {
      sendControl(ws, { t: "exit", code })
    },
  )
}

function handleHello(
  ws: ServerWebSocket<WsData>,
  store: SessionStore,
  hello: {
    sessionId?: string | undefined
    lastOffset?: number | undefined
    cols: number
    rows: number
  },
): void {
  const existing = hello.sessionId === undefined ? undefined : store.get(hello.sessionId)
  const session = existing ?? store.create({ cols: hello.cols, rows: hello.rows })
  attachSession(ws, session)
  session.resize(hello.cols, hello.rows)
  const resume = hello.lastOffset === undefined ? null : session.buffer.sliceFrom(hello.lastOffset)
  if (existing !== undefined && resume !== null && hello.lastOffset !== undefined) {
    sendControl(ws, { t: "welcome", sessionId: session.id, offset: hello.lastOffset })
    if (resume.length > 0) ws.send(encodeOutput(hello.lastOffset, resume))
    return
  }
  const tail = session.buffer.tail(256 * 1024)
  sendControl(ws, { t: "welcome", sessionId: session.id, offset: tail.offset })
  sendControl(ws, { t: "reset", offset: tail.offset })
  if (tail.data.length > 0) ws.send(encodeOutput(tail.offset, tail.data))
}

function handleText(ws: ServerWebSocket<WsData>, store: SessionStore, raw: string): void {
  const control = parseClientControl(raw)
  switch (control.t) {
    case "hello":
      ws.data.detach?.()
      handleHello(ws, store, control)
      return
    case "resize":
      ws.data.session?.resize(control.cols, control.rows)
      return
    case "ping":
      sendControl(ws, { t: "pong" })
      return
  }
}

export function createWsHandlers(store: SessionStore): {
  readonly message: (ws: ServerWebSocket<WsData>, message: string | Buffer) => void
  readonly close: (ws: ServerWebSocket<WsData>) => void
} {
  return {
    message(ws, message) {
      try {
        if (typeof message === "string") {
          handleText(ws, store, message)
        } else {
          const frame = decodeBinaryFrame(new Uint8Array(message))
          if (frame.kind === "input") ws.data.session?.write(frame.payload)
        }
      } catch (error) {
        if (error instanceof ProtocolError) {
          sendControl(ws, { t: "error", message: error.message })
          ws.close(1002, "protocol error")
          return
        }
        throw error
      }
    },
    close(ws) {
      ws.data.detach?.()
      ws.data.detach = undefined
      ws.data.session = undefined
    },
  }
}
