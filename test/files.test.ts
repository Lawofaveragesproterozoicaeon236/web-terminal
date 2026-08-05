import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesApi, FilesError } from "../src/server/files.ts"

let root = ""
let outside = ""
let api: FilesApi

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wt-files-root-"))
  outside = await mkdtemp(join(tmpdir(), "wt-files-outside-"))
  await writeFile(join(outside, "secret.txt"), "top secret")
  await writeFile(join(root, "hello.txt"), "hello world")
  api = new FilesApi(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe("path jail", () => {
  test("rejects .. traversal", () => {
    expect(() => api.resolve("../etc/passwd")).toThrow(FilesError)
    expect(() => api.resolve("a/../../etc")).toThrow(FilesError)
  })

  test("rejects absolute escape", () => {
    expect(() => api.resolve("/etc/passwd")).toThrow(FilesError)
  })

  test("allows normal relative paths", () => {
    expect(api.resolve("hello.txt")).toBe(join(root, "hello.txt"))
    expect(api.resolve("")).toBe(root)
  })

  test("rejects symlink escape on read", async () => {
    await symlink(join(outside, "secret.txt"), join(root, "sneaky"))
    await expect(api.read("sneaky")).rejects.toThrow(FilesError)
  })
})

describe("operations", () => {
  test("list returns entries with kinds", async () => {
    const entries = await api.list("")
    const names = entries.map((e) => e.name)
    expect(names).toContain("hello.txt")
    const hello = entries.find((e) => e.name === "hello.txt")
    expect(hello?.kind).toBe("file")
    expect(hello?.size).toBe(11)
  })

  test("read returns file bytes", async () => {
    const content = await api.read("hello.txt")
    expect(new TextDecoder().decode(content)).toBe("hello world")
  })

  test("write creates and overwrites; read round-trips", async () => {
    const body = new TextEncoder().encode("edited content")
    await api.write("sub/dir/new.txt", body)
    const back = await api.read("sub/dir/new.txt")
    expect(new TextDecoder().decode(back)).toBe("edited content")
  })

  test("read of missing file throws not-found", async () => {
    await expect(api.read("nope.txt")).rejects.toThrow(FilesError)
  })

  test("list of a file path throws not-a-directory", async () => {
    await expect(api.list("hello.txt")).rejects.toThrow(FilesError)
  })

  test("remove deletes a file", async () => {
    await api.remove("hello.txt")
    await expect(api.read("hello.txt")).rejects.toThrow(FilesError)
  })
})
