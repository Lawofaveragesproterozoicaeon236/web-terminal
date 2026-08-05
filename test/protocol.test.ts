import { describe, expect, test } from "bun:test"
import {
  decodeBinaryFrame,
  encodeInput,
  encodeOutput,
  OPCODE,
  ProtocolError,
  parseClientControl,
  parseServerControl,
  sessionIdSchema,
} from "../src/shared/protocol.ts"

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

describe("binary frames", () => {
  test("output frame roundtrips offset and payload", () => {
    const frame = decodeBinaryFrame(encodeOutput(12345, bytes("hello")))
    expect(frame.kind).toBe("output")
    if (frame.kind !== "output") throw new Error("unreachable")
    expect(frame.offset).toBe(12345)
    expect(new TextDecoder().decode(frame.payload)).toBe("hello")
  })

  test("output frame supports offsets beyond 2^32", () => {
    const big = 2 ** 40 + 7
    const frame = decodeBinaryFrame(encodeOutput(big, bytes("x")))
    if (frame.kind !== "output") throw new Error("unreachable")
    expect(frame.offset).toBe(big)
  })

  test("input frame roundtrips payload", () => {
    const frame = decodeBinaryFrame(encodeInput(bytes("ls -la\r")))
    expect(frame.kind).toBe("input")
    if (frame.kind !== "input") throw new Error("unreachable")
    expect(new TextDecoder().decode(frame.payload)).toBe("ls -la\r")
  })

  test("empty payload output frame roundtrips", () => {
    const frame = decodeBinaryFrame(encodeOutput(0, new Uint8Array(0)))
    if (frame.kind !== "output") throw new Error("unreachable")
    expect(frame.offset).toBe(0)
    expect(frame.payload.length).toBe(0)
  })

  test("unknown opcode rejects", () => {
    expect(() => decodeBinaryFrame(new Uint8Array([0x7f, 1, 2]))).toThrow(ProtocolError)
  })

  test("truncated output frame rejects", () => {
    const full = encodeOutput(1, bytes("abc"))
    expect(() => decodeBinaryFrame(full.slice(0, 4))).toThrow(ProtocolError)
  })

  test("opcode table stays stable", () => {
    expect(OPCODE.output).toBe(0x01)
    expect(OPCODE.input).toBe(0x02)
  })
})

describe("control messages", () => {
  test("hello parses", () => {
    const msg = parseClientControl(JSON.stringify({ t: "hello", cols: 80, rows: 24 }))
    expect(msg.t).toBe("hello")
  })

  test("hello with resume fields parses", () => {
    const msg = parseClientControl(
      JSON.stringify({ t: "hello", sessionId: "s1", lastOffset: 42, cols: 80, rows: 24 }),
    )
    if (msg.t !== "hello") throw new Error("unreachable")
    expect(msg.sessionId).toBe(sessionIdSchema.parse("s1"))
    expect(msg.lastOffset).toBe(42)
  })

  test("malformed json rejects", () => {
    expect(() => parseClientControl("{nope")).toThrow(ProtocolError)
  })

  test("unknown control type rejects", () => {
    expect(() => parseClientControl(JSON.stringify({ t: "hax" }))).toThrow(ProtocolError)
  })

  test("out-of-range resize rejects", () => {
    expect(() => parseClientControl(JSON.stringify({ t: "resize", cols: 0, rows: 5 }))).toThrow(
      ProtocolError,
    )
  })

  test("server control parses only known variants", () => {
    expect(
      parseServerControl(JSON.stringify({ t: "welcome", sessionId: "session-1", offset: 4 })),
    ).toEqual({ t: "welcome", sessionId: sessionIdSchema.parse("session-1"), offset: 4 })
    expect(() => parseServerControl(JSON.stringify({ t: "future" }))).toThrow(ProtocolError)
  })
})
