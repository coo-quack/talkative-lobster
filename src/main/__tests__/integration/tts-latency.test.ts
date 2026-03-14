import { beforeAll, describe, expect, it } from 'vitest'
import { TTS_MODELS } from '../../../shared/types'
import { ElevenLabsTts } from '../../tts/elevenlabs-tts'
import { requireApiKey } from './helpers'

const TEST_TEXT = 'こんにちは、今日はいい天気ですね。何かお手伝いできることはありますか？'
const VOICE_ID = 'pFZP5JQG7iQjIQuC4Bku' // Lily

let apiKey: string

beforeAll(() => {
  apiKey = requireApiKey('ELEVENLABS_API_KEY')
})

describe('TTS Latency Comparison', () => {
  for (const model of TTS_MODELS) {
    it(`${model.name} (${model.id}): time-to-first-chunk and total time`, async () => {
      const engine = new ElevenLabsTts({
        apiKey,
        voiceId: VOICE_ID,
        modelId: model.id
      })

      const startTime = performance.now()
      let firstChunkTime = 0
      let totalChunks = 0
      let totalBytes = 0

      for await (const chunk of engine.stream(TEST_TEXT)) {
        if (totalChunks === 0) {
          firstChunkTime = performance.now() - startTime
        }
        totalChunks++
        totalBytes += chunk.length
      }

      const totalTime = performance.now() - startTime

      console.log(`\n  📊 ${model.name} (${model.id}):`)
      console.log(`     First chunk: ${firstChunkTime.toFixed(0)}ms`)
      console.log(`     Total time:  ${totalTime.toFixed(0)}ms`)
      console.log(`     Chunks:      ${totalChunks}`)
      console.log(`     Total bytes: ${(totalBytes / 1024).toFixed(1)}KB`)
      console.log(`     Avg chunk:   ${(totalBytes / totalChunks / 1024).toFixed(1)}KB`)

      expect(firstChunkTime).toBeGreaterThan(0)
      expect(totalChunks).toBeGreaterThan(0)
      expect(totalBytes).toBeGreaterThan(0)
    }, 30_000)
  }

  it('measures chunk arrival intervals for default model', async () => {
    const engine = new ElevenLabsTts({
      apiKey,
      voiceId: VOICE_ID,
      modelId: 'eleven_multilingual_v2'
    })

    const chunkTimes: number[] = []
    const startTime = performance.now()

    for await (const _chunk of engine.stream(TEST_TEXT)) {
      chunkTimes.push(performance.now() - startTime)
    }

    const intervals: number[] = []
    for (let i = 1; i < chunkTimes.length; i++) {
      intervals.push(chunkTimes[i] - chunkTimes[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const maxInterval = Math.max(...intervals)

    console.log(`\n  📊 Chunk interval analysis (eleven_multilingual_v2):`)
    console.log(`     Total chunks:  ${chunkTimes.length}`)
    console.log(`     Avg interval:  ${avgInterval.toFixed(0)}ms`)
    console.log(`     Max interval:  ${maxInterval.toFixed(0)}ms`)
    console.log(
      `     First 5 intervals: ${intervals
        .slice(0, 5)
        .map((i) => `${i.toFixed(0)}ms`)
        .join(', ')}`
    )

    // Max interval should not exceed 2s (would cause audible gap)
    expect(maxInterval).toBeLessThan(2000)
  }, 30_000)
})
