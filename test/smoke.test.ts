import { expect, test } from "bun:test"
import { APP_NAME } from "../src/server/index.ts"

test("smoke", () => {
  expect(APP_NAME).toBe("web-terminal")
})
