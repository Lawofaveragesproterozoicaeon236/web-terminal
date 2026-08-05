import { describe, expect, test } from "bun:test"
import { Auth, hashPassword } from "../src/server/auth.ts"

const PASSWORD = "correct horse battery staple"

async function makeAuth(nowRef: { value: number }): Promise<Auth> {
  const hash = await hashPassword(PASSWORD)
  return new Auth({
    passwordHash: hash,
    sessionTtlMs: 1000 * 60 * 60,
    maxFailures: 5,
    failureWindowMs: 1000 * 60 * 5,
    now: () => nowRef.value,
  })
}

describe("hashPassword", () => {
  test("produces an argon2id hash", async () => {
    const hash = await hashPassword(PASSWORD)
    expect(hash.startsWith("$argon2id$")).toBe(true)
  })
})

describe("Auth", () => {
  test("correct password yields a session token that validates", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    const result = await auth.login(PASSWORD, "1.2.3.4")
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("unreachable")
    expect(result.token.length).toBeGreaterThanOrEqual(32)
    expect(auth.validate(result.token)).toBe(true)
  })

  test("wrong password is invalid and token undefined does not validate", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    const result = await auth.login("nope", "1.2.3.4")
    expect(result.kind).toBe("invalid")
    expect(auth.validate(undefined)).toBe(false)
    expect(auth.validate("forged-token")).toBe(false)
  })

  test("sixth rapid failure from one IP is rate-limited; other IP unaffected", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    for (let i = 0; i < 5; i++) {
      const r = await auth.login("nope", "9.9.9.9")
      expect(r.kind).toBe("invalid")
    }
    const limited = await auth.login("nope", "9.9.9.9")
    expect(limited.kind).toBe("rate-limited")
    const evenCorrect = await auth.login(PASSWORD, "9.9.9.9")
    expect(evenCorrect.kind).toBe("rate-limited")
    const other = await auth.login(PASSWORD, "8.8.8.8")
    expect(other.kind).toBe("ok")
  })

  test("rate limit window expires", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    for (let i = 0; i < 6; i++) await auth.login("nope", "9.9.9.9")
    now.value += 1000 * 60 * 5 + 1
    const after = await auth.login(PASSWORD, "9.9.9.9")
    expect(after.kind).toBe("ok")
  })

  test("concurrent failures from one IP cannot exceed the failure limit", async () => {
    // momus F2: each request snapshots recentFailures before awaiting verify, so a
    // parallel burst all passes the threshold and records ~1 failure total.
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    const burst = await Promise.all(Array.from({ length: 20 }, () => auth.login("nope", "9.9.9.9")))
    // after the burst the IP must be locked out: further attempts are rate-limited
    const after = await auth.login("nope", "9.9.9.9")
    expect(after.kind).toBe("rate-limited")
    const limitedCount = burst.filter((r) => r.kind === "rate-limited").length
    // at most maxFailures attempts should have run the verify path
    const invalidCount = burst.filter((r) => r.kind === "invalid").length
    expect(invalidCount).toBeLessThanOrEqual(5)
    expect(limitedCount).toBeGreaterThanOrEqual(15)
  })

  test("session expires after ttl", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    const result = await auth.login(PASSWORD, "1.2.3.4")
    if (result.kind !== "ok") throw new Error("unreachable")
    now.value += 1000 * 60 * 60 + 1
    expect(auth.validate(result.token)).toBe(false)
  })

  test("logout invalidates token", async () => {
    const now = { value: 1_000_000 }
    const auth = await makeAuth(now)
    const result = await auth.login(PASSWORD, "1.2.3.4")
    if (result.kind !== "ok") throw new Error("unreachable")
    auth.logout(result.token)
    expect(auth.validate(result.token)).toBe(false)
  })
})
