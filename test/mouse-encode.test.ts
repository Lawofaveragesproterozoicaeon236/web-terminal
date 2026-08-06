import { describe, expect, test } from "bun:test"
import { encodeMouseClick, encodeMouseMotion } from "../src/client/mouse-encode.ts"

describe("encodeMouseClick", () => {
  test("left press at 0,0", () => {
    expect(encodeMouseClick("left", "press", 0, 0)).toBe("\u001b[<0;1;1M")
  })

  test("left release at 0,0 uses m suffix", () => {
    expect(encodeMouseClick("left", "release", 0, 0)).toBe("\u001b[<0;1;1m")
  })

  test("coordinates are 1-based", () => {
    expect(encodeMouseClick("left", "press", 34, 9)).toBe("\u001b[<0;35;10M")
  })

  test("right and middle buttons", () => {
    expect(encodeMouseClick("right", "press", 0, 0)).toBe("\u001b[<2;1;1M")
    expect(encodeMouseClick("middle", "press", 0, 0)).toBe("\u001b[<1;1;1M")
  })

  test("wheel buttons 64/65", () => {
    expect(encodeMouseClick("wheel-up", "press", 4, 2)).toBe("\u001b[<64;5;3M")
    expect(encodeMouseClick("wheel-down", "press", 4, 2)).toBe("\u001b[<65;5;3M")
  })

  test("modifiers add bits", () => {
    expect(encodeMouseClick("left", "press", 0, 0, { shift: true })).toBe("\u001b[<4;1;1M")
    expect(encodeMouseClick("left", "press", 0, 0, { ctrl: true })).toBe("\u001b[<16;1;1M")
    expect(encodeMouseClick("left", "press", 0, 0, { shift: true, ctrl: true, alt: true })).toBe(
      "\u001b[<28;1;1M",
    )
  })
})

describe("encodeMouseMotion", () => {
  test("motion with left button held adds 32", () => {
    expect(encodeMouseMotion("left", 0, 0)).toBe("\u001b[<32;1;1M")
  })

  test("motion without button uses 35", () => {
    expect(encodeMouseMotion("none", 0, 0)).toBe("\u001b[<35;1;1M")
  })
})
