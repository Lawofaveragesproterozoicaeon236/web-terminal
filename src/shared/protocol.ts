import { z } from "zod"

/** Binary frame opcodes (first byte of a binary WebSocket message). */
export const OPCODE = {
  output: 0x01,
  input: 0x02,
} as const

export type Opcode = (typeof OPCODE)[keyof typeof OPCODE]

const OUTPUT_HEADER_BYTES = 9
const OFFSET_BYTES = 8

export class ProtocolError extends Error {
  override readonly name = "ProtocolError"
}

export const clientHelloSchema = z.object({
  t: z.literal("hello"),
  sessionId: z.string().optional(),
  lastOffset: z.number().int().nonnegative().optional(),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
})

export const resizeSchema = z.object({
  t: z.literal("resize"),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
})

export const ackSchema = z.object({ t: z.literal("ack"), offset: z.number().int().nonnegative() })
export const pingSchema = z.object({ t: z.literal("ping") })

export const clientControlSchema = z.discriminatedUnion("t", [
  clientHelloSchema,
  resizeSchema,
  ackSchema,
  pingSchema,
])

export type ClientControl = z.infer<typeof clientControlSchema>

export type ServerControl =
  | { readonly t: "welcome"; readonly sessionId: string; readonly offset: number }
  | { readonly t: "reset"; readonly offset: number }
  | { readonly t: "pong" }
  | { readonly t: "exit"; readonly code: number }
  | { readonly t: "error"; readonly message: string }

export type OutputFrame = {
  readonly kind: "output"
  readonly offset: number
  readonly payload: Uint8Array
}
export type InputFrame = { readonly kind: "input"; readonly payload: Uint8Array }
export type BinaryFrame = OutputFrame | InputFrame

export function encodeOutput(offset: number, payload: Uint8Array): Uint8Array {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ProtocolError(`invalid offset: ${offset}`)
  }
  const frame = new Uint8Array(OUTPUT_HEADER_BYTES + payload.length)
  frame[0] = OPCODE.output
  new DataView(frame.buffer).setBigUint64(1, BigInt(offset))
  frame.set(payload, OUTPUT_HEADER_BYTES)
  return frame
}

export function encodeInput(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.length)
  frame[0] = OPCODE.input
  frame.set(payload, 1)
  return frame
}

export function decodeBinaryFrame(data: Uint8Array): BinaryFrame {
  const opcode = data[0]
  if (opcode === undefined) throw new ProtocolError("empty frame")
  switch (opcode) {
    case OPCODE.output: {
      if (data.length < OUTPUT_HEADER_BYTES) throw new ProtocolError("truncated output frame")
      const view = new DataView(data.buffer, data.byteOffset + 1, OFFSET_BYTES)
      const offset = Number(view.getBigUint64(0))
      if (!Number.isSafeInteger(offset)) throw new ProtocolError("offset overflow")
      return { kind: "output", offset, payload: data.subarray(OUTPUT_HEADER_BYTES) }
    }
    case OPCODE.input:
      return { kind: "input", payload: data.subarray(1) }
    default:
      throw new ProtocolError(`unknown opcode: ${opcode}`)
  }
}

export function parseClientControl(raw: string): ClientControl {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProtocolError(`malformed control: ${error.message}`)
    throw error
  }
  const parsed = clientControlSchema.safeParse(json)
  if (!parsed.success) throw new ProtocolError(`invalid control: ${parsed.error.message}`)
  return parsed.data
}
