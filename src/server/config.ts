import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { hashPassword } from "./auth.ts"

const envSchema = z.object({
  WT_PORT: z.coerce.number().int().min(0).max(65535).default(7777),
  WT_HOST: z.string().default("127.0.0.1"),
  WT_PASSWORD: z.string().min(8).optional(),
  WT_PASSWORD_HASH: z.string().startsWith("$argon2").optional(),
  WT_FILES_ROOT: z.string().default(homedir()),
  WT_HERDR_SOCKET: z.string().default(join(homedir(), ".config", "herdr", "herdr.sock")),
  WT_ALLOWED_ORIGINS: z.string().default(""),
})

export type ServerConfig = {
  readonly port: number
  readonly host: string
  readonly passwordHash: string
  readonly filesRoot: string
  readonly herdrSocket: string
  readonly allowedOrigins: readonly string[]
}

export class ConfigError extends Error {
  override readonly name = "ConfigError"
}

export async function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Promise<ServerConfig> {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) throw new ConfigError(parsed.error.message)
  const {
    WT_PORT,
    WT_HOST,
    WT_PASSWORD,
    WT_PASSWORD_HASH,
    WT_FILES_ROOT,
    WT_HERDR_SOCKET,
    WT_ALLOWED_ORIGINS,
  } = parsed.data
  const passwordHash =
    WT_PASSWORD_HASH ?? (WT_PASSWORD === undefined ? undefined : await hashPassword(WT_PASSWORD))
  if (passwordHash === undefined) {
    throw new ConfigError("set WT_PASSWORD (>=8 chars) or WT_PASSWORD_HASH (argon2id)")
  }
  return {
    port: WT_PORT,
    host: WT_HOST,
    passwordHash,
    filesRoot: WT_FILES_ROOT,
    herdrSocket: WT_HERDR_SOCKET,
    allowedOrigins: WT_ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o !== ""),
  }
}
