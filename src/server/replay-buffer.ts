const ESC = 0x1b
const NEWLINE = 0x0a
const UTF8_CONTINUATION_MASK = 0xc0
const UTF8_CONTINUATION_BYTE = 0x80

/**
 * Trim a replay tail to a boundary that is safe to repaint from: never inside an
 * escape sequence and never inside a multi-byte UTF-8 codepoint. Prefers starting
 * just after the most recent newline within the budget, which also resets line state.
 */
export function snapTailToSafeBoundary(
  data: Uint8Array,
  maxBytes: number,
): { readonly data: Uint8Array; readonly skipped: number } {
  if (data.length <= maxBytes) return { data, skipped: 0 }
  const budgetStart = data.length - maxBytes
  for (let i = budgetStart; i < data.length; i++) {
    if (data[i] === NEWLINE) return { data: data.subarray(i + 1), skipped: i + 1 }
  }
  let start = budgetStart
  while (start < data.length) {
    const byte = data[start]
    if (byte === undefined) break
    const isContinuation = (byte & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BYTE
    if (isContinuation) {
      start += 1
      continue
    }
    break
  }
  for (let i = start; i > budgetStart - 1 && i >= 0; i--) {
    if (data[i] === ESC) {
      start = i
      break
    }
  }
  const escapeAt = data.subarray(budgetStart, start).lastIndexOf(ESC)
  if (escapeAt !== -1) start = budgetStart + escapeAt
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
