const TOKEN_BYTES = 32
const PASSWORD_MEMORY_COST = 65_536
const PASSWORD_TIME_COST = 3

type LoginResult =
  | { readonly kind: "ok"; readonly token: string }
  | { readonly kind: "invalid" }
  | { readonly kind: "rate-limited"; readonly retryAfterSeconds: number }

type AuthOptions = {
  readonly passwordHash: string
  readonly sessionTtlMs?: number
  readonly maxFailures?: number
  readonly failureWindowMs?: number
  readonly now?: () => number
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: PASSWORD_MEMORY_COST,
    timeCost: PASSWORD_TIME_COST,
  })
}

type SessionRecord = { readonly expiresAt: number }
type FailureRecord = { readonly failures: readonly number[] }

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const DEFAULT_MAX_FAILURES = 5
const DEFAULT_FAILURE_WINDOW_MS = 1000 * 60 * 5

export class Auth {
  readonly #passwordHash: string
  readonly #sessionTtlMs: number
  readonly #maxFailures: number
  readonly #failureWindowMs: number
  readonly #now: () => number
  readonly #sessions = new Map<string, SessionRecord>()
  readonly #failuresByIp = new Map<string, FailureRecord>()

  constructor(options: AuthOptions) {
    this.#passwordHash = options.passwordHash
    this.#sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
    this.#maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES
    this.#failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS
    this.#now = options.now ?? Date.now
  }

  async login(password: string, ip: string): Promise<LoginResult> {
    const now = this.#now()
    const recentFailures = this.#recentFailures(ip, now)
    if (recentFailures.length >= this.#maxFailures) {
      const oldest = recentFailures[0] ?? now
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.#failureWindowMs - now) / 1000),
      )
      return { kind: "rate-limited", retryAfterSeconds }
    }
    // Reserve a failure slot synchronously BEFORE any await. Concurrent logins each
    // see the updated map immediately, so a parallel burst cannot slip past the
    // threshold with a stale snapshot. The reservation is rolled back on success.
    this.#failuresByIp.set(ip, { failures: [...recentFailures, now] })
    const valid = await Bun.password.verify(password, this.#passwordHash)
    if (!valid) {
      return { kind: "invalid" }
    }
    this.#failuresByIp.delete(ip)
    const token = this.#mintToken()
    this.#sessions.set(token, { expiresAt: now + this.#sessionTtlMs })
    return { kind: "ok", token }
  }

  validate(token: string | undefined): boolean {
    if (token === undefined) return false
    const record = this.#sessions.get(token)
    if (record === undefined) return false
    if (record.expiresAt <= this.#now()) {
      this.#sessions.delete(token)
      return false
    }
    return true
  }

  logout(token: string): void {
    this.#sessions.delete(token)
  }

  #recentFailures(ip: string, now: number): number[] {
    const record = this.#failuresByIp.get(ip)
    if (record === undefined) return []
    const cutoff = now - this.#failureWindowMs
    return record.failures.filter((at) => at > cutoff)
  }

  #mintToken(): string {
    const bytes = new Uint8Array(TOKEN_BYTES)
    crypto.getRandomValues(bytes)
    return Buffer.from(bytes).toString("base64url")
  }
}
