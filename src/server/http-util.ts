import type { Auth } from "./auth.ts"

export const SESSION_COOKIE = "wt_session"

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie")
  if (header === null) return undefined
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

export function clientIp(req: Request, fallback: string): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    fallback
  )
}

export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")
  if (proto !== null) return proto === "https"
  return new URL(req.url).protocol === "https:"
}

export function sessionCookieHeader(token: string, secure: boolean, maxAgeSeconds: number): string {
  const flags = ["HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`]
  if (secure) flags.push("Secure")
  return `${SESSION_COOKIE}=${token}; ${flags.join("; ")}`
}

export function requireAuth(req: Request, auth: Auth): Response | undefined {
  const token = readCookie(req, SESSION_COOKIE)
  if (!auth.validate(token)) return json({ error: "unauthorized" }, 401)
  return undefined
}

export function checkOrigin(req: Request, allowedOrigins: readonly string[]): boolean {
  const origin = req.headers.get("origin")
  if (origin === null) return true
  if (allowedOrigins.includes(origin)) return true
  const host = req.headers.get("host")
  if (host === null) return false
  try {
    return new URL(origin).host === host
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}
