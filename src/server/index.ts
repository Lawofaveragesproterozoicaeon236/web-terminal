import indexPage from "../client/index.html"
import { type ApiContext, handleApi } from "./api-routes.ts"
import { Auth } from "./auth.ts"
import { loadConfig } from "./config.ts"
import { FilesApi } from "./files.ts"
import { HerdrClient } from "./herdr.ts"
import { checkOrigin, requireAuth } from "./http-util.ts"
import { SessionStore } from "./session-store.ts"
import { createWsHandlers, type WsData } from "./ws-handler.ts"

const GHOSTTY_WASM_PATH = new URL("../../node_modules/ghostty-web/ghostty-vt.wasm", import.meta.url)
  .pathname

export async function startServer(env: Readonly<Record<string, string | undefined>> = process.env) {
  const config = await loadConfig(env)
  const auth = new Auth({ passwordHash: config.passwordHash })
  const sessions = new SessionStore()
  const herdr = new HerdrClient({
    socketPath: config.herdrSocket,
    startServer: async () => {
      Bun.spawn(["herdr", "server"], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      }).unref()
    },
  })
  const ctx: ApiContext = { auth, config, files: new FilesApi(config.filesRoot), herdr, sessions }
  const wsHandlers = createWsHandlers(sessions)

  const server = Bun.serve<WsData>({
    port: config.port,
    hostname: config.host,
    routes: { "/": indexPage },
    async fetch(req, serverInstance) {
      const url = new URL(req.url)
      if (url.pathname === "/ghostty-vt.wasm") {
        return new Response(Bun.file(GHOSTTY_WASM_PATH), {
          headers: { "content-type": "application/wasm" },
        })
      }
      if (url.pathname === "/ws") {
        if (!checkOrigin(req, config.allowedOrigins))
          return new Response("forbidden origin", { status: 403 })
        const denied = requireAuth(req, auth)
        if (denied !== undefined) return denied
        const upgraded = serverInstance.upgrade(req, {
          data: { detach: undefined, session: undefined },
        })
        if (upgraded) return undefined as unknown as Response
        return new Response("upgrade failed", { status: 400 })
      }
      const api = await handleApi(req, serverInstance, ctx)
      if (api !== undefined) return api
      return new Response("not found", { status: 404 })
    },
    websocket: {
      ...wsHandlers,
      perMessageDeflate: true,
    },
  })

  void herdr.ensureRunning().catch((error: unknown) => {
    console.error("herdr ensure failed at boot:", error instanceof Error ? error.message : error)
  })

  return server
}

if (import.meta.main) {
  const server = await startServer()
  console.log(`web-terminal listening on http://${server.hostname}:${server.port}`)
}
