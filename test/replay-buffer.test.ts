import { describe, expect, test } from "bun:test"
import { ReplayBuffer, snapTailToSafeBoundary } from "../src/server/replay-buffer.ts"

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)
const text = (b: Uint8Array): string => new TextDecoder().decode(b)

describe("ReplayBuffer", () => {
  test("appends advance endOffset and retain content", () => {
    const buf = new ReplayBuffer(1024)
    buf.append(bytes("hello "))
    buf.append(bytes("world"))
    expect(buf.endOffset).toBe(11)
    expect(buf.startOffset).toBe(0)
    const slice = buf.sliceFrom(0)
    expect(slice).not.toBeNull()
    expect(text(slice ?? new Uint8Array(0))).toBe("hello world")
  })

  test("sliceFrom mid-offset returns delta", () => {
    const buf = new ReplayBuffer(1024)
    buf.append(bytes("abcdef"))
    expect(text(buf.sliceFrom(3) ?? new Uint8Array(0))).toBe("def")
  })

  test("sliceFrom at endOffset returns empty", () => {
    const buf = new ReplayBuffer(1024)
    buf.append(bytes("abc"))
    const slice = buf.sliceFrom(3)
    expect(slice).not.toBeNull()
    expect((slice ?? bytes("x")).length).toBe(0)
  })

  test("eviction moves startOffset and invalidates old offsets", () => {
    const buf = new ReplayBuffer(8)
    buf.append(bytes("12345678"))
    buf.append(bytes("ABCD"))
    expect(buf.endOffset).toBe(12)
    expect(buf.startOffset).toBe(4)
    expect(buf.sliceFrom(0)).toBeNull()
    expect(text(buf.sliceFrom(4) ?? new Uint8Array(0))).toBe("5678ABCD")
  })

  test("oversized single append keeps trailing capacity bytes", () => {
    const buf = new ReplayBuffer(4)
    buf.append(bytes("123456789"))
    expect(buf.endOffset).toBe(9)
    expect(buf.startOffset).toBe(5)
    expect(text(buf.sliceFrom(5) ?? new Uint8Array(0))).toBe("6789")
  })

  test("future offset returns null", () => {
    const buf = new ReplayBuffer(16)
    buf.append(bytes("ab"))
    expect(buf.sliceFrom(99)).toBeNull()
  })

  test("tail returns trailing bytes with correct offset", () => {
    const buf = new ReplayBuffer(1024)
    buf.append(bytes("0123456789"))
    const t = buf.tail(4)
    expect(t.offset).toBe(6)
    expect(text(t.data)).toBe("6789")
  })

  test("tail larger than content returns everything", () => {
    const buf = new ReplayBuffer(1024)
    buf.append(bytes("xy"))
    const t = buf.tail(100)
    expect(t.offset).toBe(0)
    expect(text(t.data)).toBe("xy")
  })
})

describe("snapTailToSafeBoundary", () => {
  test("starts after the last newline so the tail never begins mid-line", () => {
    const data = bytes("line one\nline two\nline three")
    const snapped = snapTailToSafeBoundary(data, 20)
    expect(text(snapped.data).startsWith("line")).toBe(true)
    expect(snapped.skipped).toBeGreaterThanOrEqual(0)
  })

  test("never starts inside an escape sequence", () => {
    const data = new Uint8Array([...bytes("abc\n"), 0x1b, 0x5b, 0x33, 0x31, 0x6d, ...bytes("red")])
    const snapped = snapTailToSafeBoundary(data, data.length - 2)
    expect(snapped.data[0]).not.toBe(0x33)
    expect(snapped.data[0]).not.toBe(0x5b)
  })

  test("never starts mid multi-byte UTF-8 codepoint", () => {
    const data = bytes("\uac00\ub098\ub2e4\ub77c\ub9c8\ubc14\uc0ac")
    const snapped = snapTailToSafeBoundary(data, 10)
    expect(text(snapped.data).startsWith("\ufffd")).toBe(false)
  })

  test("returns everything when the budget covers the data", () => {
    const data = bytes("short")
    const snapped = snapTailToSafeBoundary(data, 100)
    expect(text(snapped.data)).toBe("short")
  })
})
