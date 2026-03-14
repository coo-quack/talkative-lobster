import { describe, expect, it } from 'vitest'
import { splitTextForTts } from '../tts/text-splitter'

describe('splitTextForTts', () => {
  it('returns empty array for empty/whitespace input', () => {
    expect(splitTextForTts('')).toEqual([])
    expect(splitTextForTts('   ')).toEqual([])
  })

  it('returns single chunk for short text', () => {
    expect(splitTextForTts('こんにちは')).toEqual(['こんにちは'])
  })

  it('splits on Japanese period (。)', () => {
    const text = 'これは一つ目の文です。これは二つ目の文です。'
    const result = splitTextForTts(text, 11)
    expect(result).toEqual(['これは一つ目の文です。', 'これは二つ目の文です。'])
  })

  it('splits on exclamation marks', () => {
    const text = 'すごい！本当に！ありがとう！'
    const result = splitTextForTts(text, 6)
    expect(result).toEqual(['すごい！', '本当に！', 'ありがとう！'])
  })

  it('splits on question marks', () => {
    const text = '元気ですか？何してる？'
    const result = splitTextForTts(text, 7)
    expect(result).toEqual(['元気ですか？', '何してる？'])
  })

  it('splits on newlines', () => {
    const text = 'Line one\nLine two\nLine three'
    const result = splitTextForTts(text, 15)
    expect(result).toEqual(['Line one\n', 'Line two\n', 'Line three'])
  })

  it('merges short adjacent chunks under maxChunkLength', () => {
    const text = 'あ。い。う。え。お。'
    const result = splitTextForTts(text, 200)
    expect(result).toEqual(['あ。い。う。え。お。'])
  })

  it('respects maxChunkLength when merging', () => {
    const text = 'これは長い文章です。これも長い文章です。さらに長い文章です。'
    const result = splitTextForTts(text, 15)
    expect(result.length).toBeGreaterThan(1)
  })

  it('handles mixed delimiters', () => {
    const text = 'やあ！元気？うん。いい天気だね。'
    const result = splitTextForTts(text, 8)
    expect(result).toEqual(['やあ！元気？', 'うん。', 'いい天気だね。'])
  })

  it('splits long text without delimiters at natural breaks', () => {
    const text = 'これは区切りのない、とても長いテキストです'
    const result = splitTextForTts(text, 10)
    expect(result.length).toBeGreaterThan(1)
    // Verify all text is preserved
    expect(result.join('')).toBe(text)
    // Each chunk should be at most maxChunkLength
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(10)
    }
  })

  it('force-splits text without any break points', () => {
    const text = 'あいうえおかきくけこさしすせそ'
    const result = splitTextForTts(text, 5)
    expect(result).toEqual(['あいうえお', 'かきくけこ', 'さしすせそ'])
  })

  it('prefers splitting at commas over hard splits', () => {
    const text = 'これは長い、テキスト'
    const result = splitTextForTts(text, 8)
    // Should split at the comma: "これは長い、" + "テキスト"
    expect(result[0]).toBe('これは長い、')
    expect(result[1]).toBe('テキスト')
  })

  it('uses default maxChunkLength of 200', () => {
    const text = 'Short sentence。Another short one。'
    const result = splitTextForTts(text)
    expect(result).toEqual(['Short sentence。Another short one。'])
  })
})
