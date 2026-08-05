const ESC = 0x1b
const NEWLINE = 0x0a
const UTF8_CONTINUATION_MASK = 0xc0
const UTF8_CONTINUATION_BYTE = 0x80

const CSI_FINAL_MIN = 0x40
const CSI_FINAL_MAX = 0x7e
const MAX_ESCAPE_SCAN_BYTES = 4096

/** True when the byte terminates a CSI/escape sequence. */
function isEscapeTerminator(byte: number): boolean {
  return byte >= CSI_FINAL_MIN && byte <= CSI_FINAL_MAX
}

const CSI_PARAM_MIN = 0x30
const CSI_PARAM_MAX = 0x3f
const CSI_INTERMEDIATE_MIN = 0x20
const CSI_INTERMEDIATE_MAX = 0x2f

/** Bytes that may appear between `ESC [` and the final byte of a CSI sequence. */
function isCsiBodyByte(byte: number): boolean {
  return (
    (byte >= CSI_PARAM_MIN && byte <= CSI_PARAM_MAX) ||
    (byte >= CSI_INTERMEDIATE_MIN && byte <= CSI_INTERMEDIATE_MAX)
  )
}

/**
 * Trim a replay tail to a boundary that is safe to repaint from: never inside a
 * multi-byte UTF-8 codepoint and never inside an escape sequence. Prefers starting
 * just after the most recent newline inside the budget window, which also resets
 * line state; otherwise it advances past UTF-8 continuation bytes and past any
 * escape sequence that started before the cut point.
 *
 * `maxBytes` bounds how far back the boundary search may begin. The snap is always
 * evaluated: a tail whose first byte is unsafe is trimmed even when it fits.
 */
export function snapTailToSafeBoundary(
  data: Uint8Array,
  maxBytes: number,
): { readonly data: Uint8Array; readonly skipped: number } {
  if (data.length === 0) return { data, skipped: 0 }
  const budgetStart = Math.max(0, data.length - maxBytes)

  for (let i = data.length - 1; i >= budgetStart; i--) {
    if (data[i] === NEWLINE) return { data: data.subarray(i + 1), skipped: i + 1 }
  }

  let start = budgetStart
  while (start < data.length) {
    const byte = data[start]
    if (byte === undefined) break
    if ((byte & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BYTE) {
      start += 1
      continue
    }
    break
  }

  // Detect a CSI sequence that began BEFORE this tail. Such a tail starts with a
  // run of CSI parameter/intermediate bytes followed by a final byte; ordinary text
  // does not. Skipping past that final byte prevents a mid-sequence repaint.
  const scanEnd = Math.min(data.length, start + MAX_ESCAPE_SCAN_BYTES)
  let cursor = start
  while (cursor < scanEnd) {
    const byte = data[cursor]
    if (byte === undefined) break
    if (!isCsiBodyByte(byte)) break
    cursor += 1
  }
  const finalByte = data[cursor]
  if (cursor > start && finalByte !== undefined && isEscapeTerminator(finalByte)) {
    start = cursor + 1
  }

  return { data: data.subarray(start), skipped: start }
}

/**
 * Bounded replay ring buffer with cumulative byte offsets.
 * endOffset only grows; the buffer retains at most `capacity` trailing bytes.
 */
export class ReplayBuffer {
  readonly #capacity: number
  #chunks: Uint8Array[] = []
  #stored = 0
  #end = 0

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`)
    }
    this.#capacity = capacity
  }

  get startOffset(): number {
    return this.#end - this.#stored
  }

  get endOffset(): number {
    return this.#end
  }

  append(chunk: Uint8Array): void {
    if (chunk.length === 0) return
    const kept =
      chunk.length > this.#capacity ? chunk.subarray(chunk.length - this.#capacity) : chunk
    this.#chunks.push(kept.slice())
    this.#stored += kept.length
    this.#end += chunk.length
    this.#evict()
  }

  /** Bytes from `offset` to end, or null when `offset` is out of retained range. */
  sliceFrom(offset: number): Uint8Array | null {
    if (offset < this.startOffset || offset > this.#end) return null
    const result = new Uint8Array(this.#end - offset)
    let position = this.startOffset
    let written = 0
    for (const chunk of this.#chunks) {
      const chunkEnd = position + chunk.length
      if (chunkEnd > offset) {
        const from = Math.max(0, offset - position)
        result.set(chunk.subarray(from), written)
        written += chunk.length - from
      }
      position = chunkEnd
    }
    return result
  }

  /** Trailing bytes (at most maxBytes) with the offset they start at. */
  tail(maxBytes: number): { readonly offset: number; readonly data: Uint8Array } {
    const offset = Math.max(this.startOffset, this.#end - maxBytes)
    const data = this.sliceFrom(offset)
    return { offset, data: data ?? new Uint8Array(0) }
  }

  #evict(): void {
    while (this.#chunks.length > 0 && this.#stored > this.#capacity) {
      const head = this.#chunks[0]
      if (head === undefined) break
      const excess = this.#stored - this.#capacity
      if (head.length <= excess) {
        this.#chunks.shift()
        this.#stored -= head.length
      } else {
        this.#chunks[0] = head.subarray(excess)
        this.#stored -= excess
      }
    }
  }
}
