/**
 * Filters out non-speech STT results:
 * - Whisper hallucination artifacts ([music], (silence), etc.)
 * - Speaker bleed from videos (YouTube outros, subscribe prompts)
 * - Repetitive phrases (same phrase repeated 3+ times)
 */

const EXACT_BLACKLIST = [
  // EN whisper artifacts
  'NO', 'NO_', 'you', 'Yeah.', 'Bye.', 'Thank you.',
  '(music)', '(silence)', '(noise)',
  // JP speaker bleed (YouTube / video)
  'ご視聴ありがとうございました',
  'おかげでご覧いただきありがとうございます',
  'チャンネル登録お願いします',
  'いいねボタンをお願いします',
  'ご視聴ありがとうございます',
  'ありがとうございました',
]

const SUBSTRING_BLACKLIST = [
  'ご視聴', 'チャンネル登録', 'いいねボタン', '高評価',
  'お気に入り登録', 'コメント欄',
]

export function isNonSpeech(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  // Whisper hallucination patterns: [music], (silence), etc.
  if (/^\[.*\]$/.test(trimmed) || /^\(.*\)$/.test(trimmed)) return true

  // Exact match
  if (EXACT_BLACKLIST.includes(trimmed)) return true

  // Substring match
  if (SUBSTRING_BLACKLIST.some((s) => trimmed.includes(s))) return true

  // Repetition detector: same short phrase repeated 3+ times
  // e.g. "いかについては、いかについては、いかについては"
  const segments = trimmed.split(/[、。,.]/).map((s) => s.trim()).filter(Boolean)
  if (segments.length >= 3) {
    const first = segments[0]
    if (first.length <= 20 && segments.filter((s) => s === first).length >= 3) return true
  }

  return false
}
