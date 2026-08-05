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
