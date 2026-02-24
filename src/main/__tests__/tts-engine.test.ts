import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TtsEngine } from '../tts-engine'

vi.mock('@elevenlabs/elevenlabs-js', () => {
  const ElevenLabsClient = vi.fn().mockImplementation(function () {
    return {
      textToSpeech: {
        convert: vi.fn().mockResolvedValue(Buffer.from('fake-audio')),
        stream: vi.fn().mockResolvedValue(
          (async function* () {
            yield Buffer.from('chunk1')
            yield Buffer.from('chunk2')
          })()
        ),
      },
    }
  })
  return { ElevenLabsClient }
})

describe('TtsEngine', () => {
  let engine: TtsEngine

  beforeEach(() => {
    engine = new TtsEngine({ apiKey: 'sk_test', voiceId: 'voice123' })
  })

  it('synthesizes full text', async () => {
    const audio = await engine.synthesize('Hello world')
    expect(audio).toBeInstanceOf(Buffer)
  })

  it('streams audio chunks', async () => {
    const chunks: Buffer[] = []
    for await (const chunk of engine.stream('Hello world')) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBe(2)
  })

  it('splits text into sentences', () => {
    const sentences = engine.splitIntoSentences('Hello. How are you? Fine!')
    expect(sentences).toEqual(['Hello.', 'How are you?', 'Fine!'])
  })

  it('splits Japanese text into sentences', () => {
    const sentences = engine.splitIntoSentences('こんにちは。元気ですか？はい！')
    expect(sentences).toEqual(['こんにちは。', '元気ですか？', 'はい！'])
  })

  it('can be stopped mid-stream', () => {
    engine.stop()
    expect(engine.isStopped).toBe(true)
  })
})
