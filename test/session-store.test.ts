import { afterEach, describe, expect, test } from "bun:test"
import {
  defaultCommand,
  SessionStore,
  sessionEnv,
  type TerminalSession,
} from "../src/server/session-store.ts"

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

  test("default command prefers WT_SHELL and never defaults to a blocking fish", () => {
    // fish blocks on terminal capability queries ghostty-web cannot answer (DA/DCS);
    // the server default must produce output immediately (zsh, or an explicit override).
    const savedShell = process.env["SHELL"]
    const savedOverride = process.env["WT_SHELL"]
    try {
      process.env["WT_SHELL"] = "/custom/shell"
      expect(defaultCommand()[0]).toBe("/custom/shell")
      delete process.env["WT_SHELL"]
      process.env["SHELL"] = "/opt/homebrew/bin/fish"
      const fallback = defaultCommand()[0] ?? ""
      expect(fallback.endsWith("fish")).toBe(false)
    } finally {
      if (savedOverride === undefined) delete process.env["WT_SHELL"]
      else process.env["WT_SHELL"] = savedOverride
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

  test("default command attaches to herdr, and WT_SHELL still overrides it", () => {
    const savedShell = process.env["WT_SHELL"]
    const savedAttach = process.env["WT_HERDR_ATTACH"]
    try {
      delete process.env["WT_SHELL"]
      delete process.env["WT_HERDR_ATTACH"]
      expect(defaultCommand()[0]).toBe("herdr")
      process.env["WT_HERDR_ATTACH"] = "0"
      expect(defaultCommand()[0]).not.toBe("herdr")
      delete process.env["WT_HERDR_ATTACH"]
      process.env["WT_SHELL"] = "/custom/shell"
      expect(defaultCommand()[0]).toBe("/custom/shell")
    } finally {
      if (savedShell === undefined) delete process.env["WT_SHELL"]
      else process.env["WT_SHELL"] = savedShell
      if (savedAttach === undefined) delete process.env["WT_HERDR_ATTACH"]
      else process.env["WT_HERDR_ATTACH"] = savedAttach
    }
  })

  test("a herdr-attached session does not inherit the outer herdr env", () => {
    const saved = process.env["HERDR_PANE_ID"]
    try {
      process.env["HERDR_PANE_ID"] = "w9:p1"
      expect(sessionEnv()["HERDR_PANE_ID"]).toBeUndefined()
    } finally {
      if (saved === undefined) delete process.env["HERDR_PANE_ID"]
      else process.env["HERDR_PANE_ID"] = saved
    }
  })

  test("resuming an exited session is refused so a reconnect cannot attach to a corpse", async () => {
    store = new SessionStore()
    const session = store.create({ command: ["/bin/sh", "-c", "exit 0"], cols: 80, rows: 24 })
    await waitForExit(session)
    expect(store.getLive(session.id)).toBeUndefined()
    expect(store.get(session.id)).toBe(session)
  })

  test("reaping drops exited sessions from the list", async () => {
    store = new SessionStore()
    const dead = store.create({ command: ["/bin/sh", "-c", "exit 0"], cols: 80, rows: 24 })
    const alive = store.create({ command: ["/bin/sh"], cols: 80, rows: 24 })
    await waitForExit(dead)
    store.reapExited()
    const ids = store.list().map((info) => info.id)
    expect(ids).not.toContain(dead.id)
    expect(ids).toContain(alive.id)
  })
})
