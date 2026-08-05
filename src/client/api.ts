export class ApiError extends Error {
  override readonly name = "ApiError"
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status}: ${code}`)
  }
}

async function parseError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { readonly error?: string }
  throw new ApiError(response.status, body.error ?? "unknown")
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) await parseError(response)
  return (await response.json()) as T
}

export async function apiRaw(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init)
  if (!response.ok) await parseError(response)
  return response
}

export const checkAuthed = async (): Promise<boolean> => {
  const response = await fetch("/api/me")
  return response.ok
}

export const login = (password: string): Promise<{ ok: boolean }> =>
  apiRequest("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  })
