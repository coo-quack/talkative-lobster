/**
 * Split text into sentence-level chunks for TTS providers with character limits.
 * Splits on Japanese/English sentence boundaries while keeping delimiters.
 * Falls back to splitting at word/character boundaries for long text without delimiters.
 */
export function splitTextForTts(text: string, maxChunkLength = 200): string[] {
  if (!text.trim()) return []

  // Split on sentence boundaries: 。！？!?\n
  // Keep the delimiter attached to the preceding sentence
  const sentencePattern = /(?<=[。！？!?\n])/
  const rawChunks = text.split(sentencePattern).filter((s) => s.trim())

  if (rawChunks.length === 0) return [text.trim()]

  // Merge short adjacent chunks, split long ones
  const merged: string[] = []
  let current = ''

  for (const chunk of rawChunks) {
    if (current && current.length + chunk.length > maxChunkLength) {
      merged.push(current)
      current = ''
    }

    if (chunk.length > maxChunkLength) {
      // Flush any accumulated text first
      if (current) {
        merged.push(current)
        current = ''
      }
      // Split oversized chunk at natural break points
      merged.push(...splitLongChunk(chunk, maxChunkLength))
    } else {
      current += chunk
    }
  }
  if (current) merged.push(current)

  return merged
}

/**
 * Split a long chunk that has no sentence delimiters.
 * Tries to break at commas/spaces first, then forces a hard split.
 */
function splitLongChunk(text: string, maxLen: number): string[] {
  const result: string[] = []
  let remaining = text

  while (remaining.length > maxLen) {
    // Try to find a natural break: comma, space, or CJK punctuation
    let breakIdx = -1
    for (let i = maxLen - 1; i >= maxLen / 2; i--) {
      const ch = remaining[i]
      if (ch === '、' || ch === ',' || ch === ' ' || ch === '　') {
        breakIdx = i + 1
        break
      }
    }

    // Force split if no natural break found
    if (breakIdx === -1) breakIdx = maxLen

    result.push(remaining.slice(0, breakIdx))
    remaining = remaining.slice(breakIdx)
  }

  if (remaining) result.push(remaining)
  return result
}
