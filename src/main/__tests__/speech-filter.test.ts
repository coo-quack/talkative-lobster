import { describe, it, expect } from 'vitest'
import { isNonSpeech } from '../speech-filter'

describe('isNonSpeech', () => {
  describe('whisper hallucination artifacts', () => {
    it('filters bracketed annotations like [music]', () => {
      expect(isNonSpeech('[music]')).toBe(true)
      expect(isNonSpeech('[silence]')).toBe(true)
      expect(isNonSpeech('[BLANK_AUDIO]')).toBe(true)
    })

    it('filters parenthesized annotations like (noise)', () => {
      expect(isNonSpeech('(noise)')).toBe(true)
      expect(isNonSpeech('(music)')).toBe(true)
      expect(isNonSpeech('(silence)')).toBe(true)
    })

    it('filters common EN artifacts', () => {
      expect(isNonSpeech('NO')).toBe(true)
      expect(isNonSpeech('you')).toBe(true)
      expect(isNonSpeech('Yeah.')).toBe(true)
      expect(isNonSpeech('Bye.')).toBe(true)
      expect(isNonSpeech('Thank you.')).toBe(true)
    })

    it('filters JP filler "ん"', () => {
      expect(isNonSpeech('ん')).toBe(true)
    })
  })

  describe('YouTube / video speaker bleed (exact match)', () => {
    it('filters common JP video outros', () => {
      expect(isNonSpeech('ご視聴ありがとうございました')).toBe(true)
      expect(isNonSpeech('おかげでご覧いただきありがとうございます')).toBe(true)
      expect(isNonSpeech('ご視聴ありがとうございます')).toBe(true)
      expect(isNonSpeech('ありがとうございました')).toBe(true)
    })

    it('filters subscribe / like prompts', () => {
      expect(isNonSpeech('チャンネル登録お願いします')).toBe(true)
      expect(isNonSpeech('いいねボタンをお願いします')).toBe(true)
    })

    it('handles leading/trailing whitespace', () => {
      expect(isNonSpeech('  ご視聴ありがとうございました  ')).toBe(true)
      expect(isNonSpeech(' Thank you. ')).toBe(true)
    })
  })

  describe('YouTube / video speaker bleed (substring match)', () => {
    it('filters text containing video keywords', () => {
      expect(isNonSpeech('最後までご視聴くださりありがとうございます')).toBe(true)
      expect(isNonSpeech('チャンネル登録と高評価お願いします')).toBe(true)
      expect(isNonSpeech('コメント欄で教えてください')).toBe(true)
      expect(isNonSpeech('お気に入り登録してね')).toBe(true)
    })
  })

  describe('repetition detector', () => {
    it('filters same phrase repeated 3+ times', () => {
      expect(isNonSpeech('いかについては、いかについては、いかについては')).toBe(true)
      expect(isNonSpeech('いかについては、いかについては、いかについては、いかについては')).toBe(true)
    })

    it('does not filter with only 2 repetitions', () => {
      expect(isNonSpeech('いかについては、いかについては')).toBe(false)
    })

    it('handles period-separated repetitions', () => {
      expect(isNonSpeech('はい。はい。はい。')).toBe(true)
    })

    it('does not trigger for long distinct segments', () => {
      expect(isNonSpeech('今日は天気がいいですね、明日は雨が降るかもしれません、来週は晴れるでしょう')).toBe(false)
    })
  })

  describe('valid speech passthrough', () => {
    it('passes normal JP speech', () => {
      expect(isNonSpeech('明日の東京の天気を教えてください')).toBe(false)
      expect(isNonSpeech('今日はいい天気ですね')).toBe(false)
      expect(isNonSpeech('おはようございます')).toBe(false)
    })

    it('passes normal EN speech', () => {
      expect(isNonSpeech('Hello, how are you doing today?')).toBe(false)
      expect(isNonSpeech('What is the weather like?')).toBe(false)
    })

    it('passes questions and commands', () => {
      expect(isNonSpeech('これについて教えてください')).toBe(false)
      expect(isNonSpeech('翻訳してください')).toBe(false)
    })

    it('filters empty or whitespace-only strings', () => {
      expect(isNonSpeech('')).toBe(true)
      expect(isNonSpeech('   ')).toBe(true)
    })
  })
})
