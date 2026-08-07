export type PtyOptions = {
  readonly command: readonly string[]
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

class PtyAllocationError extends Error {
  override readonly name = "PtyAllocationError"
}

type PtyHandlers = {
  readonly onData: (chunk: Uint8Array) => void
  readonly onExit: (code: number) => void
}

export type PtyHandle = {
  readonly pid: number
  readonly write: (data: string | Uint8Array) => void
  readonly resize: (cols: number, rows: number) => void
  readonly kill: () => void
}

export function spawnPty(options: PtyOptions, handlers: PtyHandlers): PtyHandle {
  const proc = Bun.spawn([...options.command], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    // A caller-supplied env is authoritative: callers strip variables (HERDR_*)
    // that must not reach the child, so process.env cannot be layered back in.
    env: { ...(options.env ?? process.env), TERM: "xterm-256color" },
    terminal: {
      cols: options.cols,
      rows: options.rows,
      data(_terminal, chunk) {
        handlers.onData(chunk)
      },
    },
  })
  const terminal = proc.terminal
  if (terminal === undefined) {
    proc.kill()
    throw new PtyAllocationError(
      "Bun.spawn did not allocate a terminal; Bun >= 1.4 canary is required",
    )
  }
  void proc.exited.then((code) => {
    handlers.onExit(code)
    terminal.close()
  })
  return {
    pid: proc.pid,
    write(data) {
      terminal.write(data)
    },
    resize(cols, rows) {
      terminal.resize(cols, rows)
    },
    kill() {
      proc.kill()
    },
  }
}
