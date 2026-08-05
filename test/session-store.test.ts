import { afterEach, describe, expect, test } from "bun:test"
import { SessionStore, type TerminalSession } from "../src/server/session-store.ts"

const decoder = new TextDecoder()

function bufferText(session: TerminalSession): string {
  return decoder.decode(session.buffer.sliceFrom(session.buffer.startOffset) ?? new Uint8Array(0))
}

function waitForOutput(session: TerminalSession, needle: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    if (bufferText(session).includes(needle)) {
      resolvePromise()
      return
    }
    const timer = setTimeout(() => {
      detach()
      rejectPromise(
        new Error(
          `timeout waiting for ${JSON.stringify(needle)}; buffer: ${bufferText(session).slice(-300)}`,
        ),
      )
    }, timeoutMs)
    const detach = session.attach(
      () => {
        if (bufferText(session).includes(needle)) {
          clearTimeout(timer)
          detach()
          resolvePromise()
        }
      },
      () => undefined,
    )
  })
}

function waitForExit(session: TerminalSession, timeoutMs = 8000): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("timeout waiting for exit")), timeoutMs)
    session.attach(
      () => undefined,
      (code) => {
        clearTimeout(timer)
        resolvePromise(code)
      },
    )
  })
}

let store: SessionStore

afterEach(() => {
  if (store === undefined) return
  for (const info of store.list()) store.remove(info.id)
})

describe("SessionStore", () => {
  test("spawns a shell whose output lands in the replay buffer", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh"], cols: 80, rows: 24 })
    session.write("printf 'marker-%s\\n' AAA\n")
    await waitForOutput(session, "marker-AAA")
    expect(bufferText(session)).toContain("marker-AAA")
  })

  test("session survives detach and keeps recording output", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh"], cols: 80, rows: 24 })
    const detach = session.attach(
      () => undefined,
      () => undefined,
    )
    session.write("printf 'first-%s\\n' 111\n")
    await waitForOutput(session, "first-111")
    detach()
    session.write("printf 'second-%s\\n' 222\n")
    await waitForOutput(session, "second-222")
    const text = bufferText(session)
    expect(text).toContain("first-111")
    expect(text).toContain("second-222")
    expect(session.info().alive).toBe(true)
  })

  test("output offsets are cumulative and re-attachable", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh"], cols: 80, rows: 24 })
    session.write("printf 'xyz-%s\\n' 999\n")
    await waitForOutput(session, "xyz-999")
    const delta = session.buffer.sliceFrom(session.buffer.startOffset)
    expect(delta).not.toBeNull()
    expect(decoder.decode(delta ?? new Uint8Array(0))).toContain("xyz-999")
  })

  test("kill terminates the session and reports exit", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh"], cols: 80, rows: 24 })
    const exitPromise = waitForExit(session)
    session.kill()
    await exitPromise
    expect(session.info().alive).toBe(false)
  })

  test("default command prefers WT_SHELL then zsh over $SHELL=fish", () => {
    // fish blocks on terminal capability queries ghostty-web cannot answer (DA/DCS);
    // the server must default to a shell that produces output immediately.
    const savedShell = process.env["SHELL"]
    process.env["SHELL"] = "/opt/homebrew/bin/fish"
    try {
      const { defaultCommand } = require("../src/server/session-store.ts") as {
        defaultCommand: () => readonly string[]
      }
      const cmd = defaultCommand()
      expect(cmd[0]).not.toBe("/opt/homebrew/bin/fish")
    } finally {
      if (savedShell === undefined) delete process.env["SHELL"]
      else process.env["SHELL"] = savedShell
    }
  })

  test("list and get reflect created sessions", () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh"], cols: 80, rows: 24, title: "work" })
    expect(store.get(session.id)).toBe(session)
    const infos = store.list()
    expect(infos.some((i) => i.id === session.id && i.title === "work")).toBe(true)
  })

  test("exited process marks session dead", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh", "-c", "exit 3"], cols: 80, rows: 24 })
    const code = await waitForExit(session)
    expect(code).toBe(3)
    expect(session.info().alive).toBe(false)
  })
})
