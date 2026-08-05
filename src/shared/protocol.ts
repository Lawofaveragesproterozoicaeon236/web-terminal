import { z } from "zod"

/** Binary frame opcodes (first byte of a binary WebSocket message). */
export const OPCODE = {
  output: 0x01,
  input: 0x02,
} as const

const OUTPUT_HEADER_BYTES = 9
const OFFSET_BYTES = 8

export const DEFAULT_TERMINAL_DIMENSIONS = { cols: 80, rows: 24 } as const
const TERMINAL_DIMENSION_LIMITS = {
  minCols: 2,
  maxCols: 1000,
  minRows: 1,
  maxRows: 1000,
} as const
export const SESSION_ID_PREVIEW_LENGTH = 8

export class ProtocolError extends Error {
  override readonly name = "ProtocolError"
}

export const sessionIdSchema = z.string().brand("SessionId")
export type SessionId = z.infer<typeof sessionIdSchema>

const clientHelloSchema = z
  .object({
    t: z.literal("hello"),
    sessionId: sessionIdSchema.optional(),
    lastOffset: z.number().int().nonnegative().optional(),
    cols: z
      .number()
      .int()
      .min(TERMINAL_DIMENSION_LIMITS.minCols)
      .max(TERMINAL_DIMENSION_LIMITS.maxCols),
    rows: z
      .number()
      .int()
      .min(TERMINAL_DIMENSION_LIMITS.minRows)
      .max(TERMINAL_DIMENSION_LIMITS.maxRows),
  })
  .readonly()

const resizeSchema = z
  .object({
    t: z.literal("resize"),
    cols: z
      .number()
      .int()
      .min(TERMINAL_DIMENSION_LIMITS.minCols)
      .max(TERMINAL_DIMENSION_LIMITS.maxCols),
    rows: z
      .number()
      .int()
      .min(TERMINAL_DIMENSION_LIMITS.minRows)
      .max(TERMINAL_DIMENSION_LIMITS.maxRows),
  })
  .readonly()

const pingSchema = z.object({ t: z.literal("ping") }).readonly()

const clientControlSchema = z.discriminatedUnion("t", [clientHelloSchema, resizeSchema, pingSchema])

export type ClientControl = z.infer<typeof clientControlSchema>

const serverControlSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("welcome"), sessionId: sessionIdSchema, offset: z.number() }).readonly(),
  z.object({ t: z.literal("reset"), offset: z.number() }).readonly(),
  z.object({ t: z.literal("pong") }).readonly(),
  z.object({ t: z.literal("exit"), code: z.number().int() }).readonly(),
  z.object({ t: z.literal("error"), message: z.string() }).readonly(),
])

export type ServerControl = z.infer<typeof serverControlSchema>

type OutputFrame = {
  readonly kind: "output"
  readonly offset: number
  readonly payload: Uint8Array
}
type InputFrame = { readonly kind: "input"; readonly payload: Uint8Array }
export type BinaryFrame = OutputFrame | InputFrame

export function encodeOutput(offset: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ProtocolError(`invalid offset: ${offset}`)
  }
  const frame = new Uint8Array(OUTPUT_HEADER_BYTES + payload.length)
  frame[0] = OPCODE.output
  new DataView(frame.buffer).setBigUint64(1, BigInt(offset))
  frame.set(payload, OUTPUT_HEADER_BYTES)
  return frame
}

export function encodeInput(payload: Uint8Array): Uint8Array<ArrayBuffer> {
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

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProtocolError(`malformed control: ${error.message}`)
    throw error
  }
}

export function parseClientControl(raw: string): ClientControl {
  const parsed = clientControlSchema.safeParse(parseJson(raw))
  if (!parsed.success) throw new ProtocolError(`invalid control: ${parsed.error.message}`)
  return parsed.data
}

export function parseServerControl(raw: string): ServerControl {
  const parsed = serverControlSchema.safeParse(parseJson(raw))
  if (!parsed.success) throw new ProtocolError(`invalid control: ${parsed.error.message}`)
  return parsed.data
}
