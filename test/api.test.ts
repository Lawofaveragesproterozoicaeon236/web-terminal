import { afterAll, describe, expect, test } from "bun:test"
import { z } from "zod"
import { apiRequest } from "../src/client/api.ts"

const server = Bun.serve({
  port: 0,
  routes: {
    "/invalid": Response.json({ ok: "yes" }),
    "/valid": Response.json({ ok: true }),
  },
})

const responseSchema = z.object({ ok: z.boolean() }).readonly()

// Given: a server response and the schema the client expects.
describe("apiRequest", () => {
  // When: valid JSON matches the boundary schema.
  test("returns parsed data when the response matches its schema", async () => {
    // Then: callers receive the typed response.
    await expect(apiRequest(`${server.url}valid`, { schema: responseSchema })).resolves.toEqual({
      ok: true,
    })
  })

  // When: valid JSON has the wrong field type.
  test("rejects data that does not match the response schema", async () => {
    // Then: malformed external data cannot enter the client as a trusted type.
    await expect(
      apiRequest(`${server.url}invalid`, { schema: responseSchema }),
    ).rejects.toBeInstanceOf(z.ZodError)
  })
})

afterAll(() => server.stop(true))
