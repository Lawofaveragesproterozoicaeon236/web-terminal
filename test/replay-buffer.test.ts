import { describe, expect, test } from "bun:test"
import { ReplayBuffer } from "../src/server/replay-buffer.ts"

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
