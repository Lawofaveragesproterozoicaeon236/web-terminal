import type { Stats } from "node:fs"
import { constants } from "node:fs"
import type { FileHandle } from "node:fs/promises"
import { lstat, mkdir, open, readdir, realpath, rm, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"

export class FilesError extends Error {
  override readonly name = "FilesError"
  constructor(
    readonly code: "outside-root" | "not-found" | "not-a-file" | "not-a-directory",
    message: string,
  ) {
    super(message)
  }
}

export type DirEntry = {
  readonly name: string
  readonly kind: "file" | "directory" | "other"
  readonly size: number
  readonly mtimeMs: number
}

function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

export class FilesApi {
  readonly #root: string

  constructor(root: string) {
    this.#root = resolve(root)
  }

  /** Resolve a client-supplied relative path inside the jail; throws FilesError on escape. */
  resolve(relPath: string): string {
    if (isAbsolute(relPath)) {
      throw new FilesError("outside-root", `absolute path rejected: ${relPath}`)
    }
    const resolved = resolve(this.#root, relPath)
    if (resolved !== this.#root && !resolved.startsWith(this.#root + sep)) {
      throw new FilesError("outside-root", `path escapes root: ${relPath}`)
    }
    if (relPath.split(/[/\\]/).includes("..")) {
      throw new FilesError("outside-root", `path traversal rejected: ${relPath}`)
    }
    return resolved
  }

  async list(relPath: string): Promise<readonly DirEntry[]> {
    const dir = await this.#materialize(relPath)
    const dirStat = await this.#statOrNotFound(dir, relPath)
    if (!dirStat.isDirectory())
      throw new FilesError("not-a-directory", `not a directory: ${relPath}`)
    const names = await readdir(dir)
    const entries = await Promise.all(
      names.map(async (name): Promise<DirEntry> => {
        try {
          const s = await stat(join(dir, name))
          let kind: DirEntry["kind"] = "other"
          if (s.isDirectory()) kind = "directory"
          else if (s.isFile()) kind = "file"
          return { name, kind, size: s.size, mtimeMs: s.mtimeMs }
        } catch (error) {
          if (isSystemError(error)) return { name, kind: "other", size: 0, mtimeMs: 0 }
          throw error
        }
      }),
    )
    return entries.toSorted((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name)
      return a.kind === "directory" ? -1 : 1
    })
  }

  async read(relPath: string): Promise<Uint8Array> {
    const file = await this.#materialize(relPath)
    const s = await this.#statOrNotFound(file, relPath)
    if (!s.isFile()) throw new FilesError("not-a-file", `not a file: ${relPath}`)
    return new Uint8Array(await Bun.file(file).arrayBuffer())
  }

  async write(relPath: string, content: Uint8Array): Promise<void> {
    const file = this.resolve(relPath)
    // Validate the nearest existing ancestor chain, not just the immediate parent,
    // so `link-dir/new/file` cannot escape through a symlinked ancestor.
    await this.#assertNearestExistingAncestorInside(file, relPath)
    await mkdir(dirname(file), { recursive: true })
    // TOCTOU-safe write: O_NOFOLLOW makes the kernel refuse the open when the final
    // component is (or was swapped to) a symlink, so validation is bound to the write
    // instead of being a separate, racy path check. The post-open realpath check on
    // the parent closes the swapped-ancestor race.
    let handle: FileHandle | undefined
    try {
      handle = await open(
        file,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        0o600,
      )
      await this.#assertRealPathInside(dirname(file), relPath, { allowMissing: false })
      await handle.writeFile(content)
    } catch (error) {
      if (isSystemError(error) && (error.code === "ELOOP" || error.code === "EMLINK")) {
        throw new FilesError("outside-root", `write target is a symlink: ${relPath}`)
      }
      throw error
    } finally {
      await handle?.close()
    }
  }

  async remove(relPath: string): Promise<void> {
    const file = await this.#materialize(relPath)
    await this.#statOrNotFound(file, relPath)
    await rm(file, { recursive: false, force: false })
  }

  /** Jail-resolve plus symlink-escape check for existing paths. */
  async #materialize(relPath: string): Promise<string> {
    const resolved = this.resolve(relPath)
    await this.#assertRealPathInside(resolved, relPath, { allowMissing: false })
    return resolved
  }

  async #assertRealPathInside(
    path: string,
    relPath: string,
    { allowMissing }: { readonly allowMissing: boolean },
  ): Promise<void> {
    try {
      await lstat(path)
    } catch (error) {
      if (isSystemError(error) && error.code === "ENOENT") {
        if (allowMissing) return
        throw new FilesError("not-found", `no such path: ${relPath}`)
      }
      throw error
    }
    const real = await realpath(path)
    const realRoot = await realpath(this.#root)
    if (real !== realRoot && !real.startsWith(realRoot + sep)) {
      throw new FilesError("outside-root", `symlink escapes root: ${relPath}`)
    }
  }

  /** Walk up to the nearest existing ancestor and verify it stays inside the root. */
  async #assertNearestExistingAncestorInside(path: string, relPath: string): Promise<void> {
    let current = path
    for (;;) {
      try {
        await lstat(current)
        await this.#assertRealPathInside(current, relPath, { allowMissing: false })
        return
      } catch (error) {
        if (isSystemError(error) && error.code === "ENOENT") {
          const parent = dirname(current)
          if (parent === current)
            throw new FilesError("outside-root", `no in-root ancestor: ${relPath}`)
          current = parent
          continue
        }
        throw error
      }
    }
  }

  async #statOrNotFound(path: string, relPath: string): Promise<Stats> {
    try {
      return await stat(path)
    } catch (error) {
      if (isSystemError(error) && error.code === "ENOENT") {
        throw new FilesError("not-found", `no such path: ${relPath}`)
      }
      throw error
    }
  }
}
