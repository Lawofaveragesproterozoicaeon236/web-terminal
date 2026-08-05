import { z } from "zod"

const apiErrorSchema = z
  .object({
    error: z.string().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  })
  .readonly()

type ApiErrorBody = {
  readonly retryAfterSeconds?: number
}

export class ApiError extends Error {
  override readonly name = "ApiError"
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body?: ApiErrorBody,
  ) {
    super(`${status}: ${code}`)
  }
}

type ApiRequestOptions<T> = {
  readonly schema: z.ZodType<T>
  readonly init?: RequestInit
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json()
}

async function parseError(response: Response): Promise<never> {
  let raw: unknown
  try {
    raw = await responseJson(response)
  } catch (error) {
    if (error instanceof SyntaxError) raw = {}
    else throw error
  }
  const parsed = apiErrorSchema.safeParse(raw)
  const body = parsed.success ? parsed.data : {}
  throw new ApiError(response.status, body.error ?? "unknown", {
    ...(body.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: body.retryAfterSeconds }),
  })
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  const response = await fetch(path, options.init)
  if (!response.ok) await parseError(response)
  return options.schema.parse(await responseJson(response))
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

const loginResponseSchema = z.object({ ok: z.boolean() }).readonly()

export const login = (password: string): Promise<{ readonly ok: boolean }> =>
  apiRequest("/api/login", {
    schema: loginResponseSchema,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    },
  })
