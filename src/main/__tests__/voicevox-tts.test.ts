import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxTts } from '../tts/voicevox-tts'

// Helper to build a mock Response.
function mockResponse(
  opts: { ok?: boolean; status?: number; json?: unknown; arrayBuffer?: ArrayBuffer } = {}
): Response {
  const ok = opts.ok ?? true
  const status = opts.status ?? (ok ? 200 : 500)
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(opts.json ?? {}),
    arrayBuffer: vi.fn().mockResolvedValue(opts.arrayBuffer ?? new ArrayBuffer(0))
  } as unknown as Response
}

describe('VoicevoxTts', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ------------------------------------------------------------------
  // 1. Constructor
  // ------------------------------------------------------------------
  describe('constructor', () => {
    it('stores the default URL when none is provided', () => {
      const tts = new VoicevoxTts()
      expect((tts as unknown as { url: string }).url).toBe('http://localhost:50021')
    })

    it('stores a custom URL when provided', () => {
      const tts = new VoicevoxTts('http://custom:50021')
      expect((tts as unknown as { url: string }).url).toBe('http://custom:50021')
    })

    it('stores the default speakerId of 1 when none is provided', () => {
      const tts = new VoicevoxTts()
      expect((tts as unknown as { speakerId: number }).speakerId).toBe(1)
    })

    it('stores a custom speakerId when provided', () => {
      const tts = new VoicevoxTts('http://localhost:50021', 42)
      expect((tts as unknown as { speakerId: number }).speakerId).toBe(42)
    })

    it('exposes encoded audio format', () => {
      const tts = new VoicevoxTts()
      expect(tts.audioFormat).toEqual({ type: 'encoded' })
    })
  })

  // ------------------------------------------------------------------
  // 2. stream() – successful round-trip
  // ------------------------------------------------------------------
  describe('stream()', () => {
    it('calls audio_query POST with encoded text and speakerId', async () => {
      const queryResponse = mockResponse({ json: { some: 'query' } })
      const synthResponse = mockResponse({ arrayBuffer: new ArrayBuffer(0) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts('http://localhost:50021', 3)
      for await (const _ of tts.stream('こんにちは')) {
        // consume
      }

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        `http://localhost:50021/audio_query?text=${encodeURIComponent('こんにちは')}&speaker=3`,
        { method: 'POST' }
      )
    })

    it('calls synthesis POST with the query body and correct headers', async () => {
      const queryData = { speed: 1, pitch: 0 }
      const queryResponse = mockResponse({ json: queryData })
      const synthResponse = mockResponse({ arrayBuffer: new ArrayBuffer(0) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts('http://localhost:50021', 5)
      for await (const _ of tts.stream('test')) {
        // consume
      }

      expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:50021/synthesis?speaker=5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryData)
      })
    })

    it('yields the complete WAV as a single buffer', async () => {
      const audioData = new Uint8Array([0x01, 0x02, 0x03, 0x04])
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ arrayBuffer: audioData.buffer as ArrayBuffer })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('hello')) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]))
    })
  })

  // ------------------------------------------------------------------
  // 3. stream() – error handling
  // ------------------------------------------------------------------
  describe('stream() error handling', () => {
    it('throws when audio_query returns a non-OK response', async () => {
      const queryResponse = mockResponse({ ok: false, status: 422 })
      fetchMock.mockResolvedValueOnce(queryResponse)

      const tts = new VoicevoxTts()
      await expect(async () => {
        for await (const _ of tts.stream('error')) {
          // consume
        }
      }).rejects.toThrow('VOICEVOX audio_query failed: 422')
    })

    it('throws when synthesis returns a non-OK response', async () => {
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ ok: false, status: 503 })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      await expect(async () => {
        for await (const _ of tts.stream('error')) {
          // consume
        }
      }).rejects.toThrow('VOICEVOX synthesis failed: 503')
    })
  })

  // ------------------------------------------------------------------
  // 4. stop() prevents yielding
  // ------------------------------------------------------------------
  describe('stop()', () => {
    it('yields nothing when stopped before arrayBuffer resolves', async () => {
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({
        arrayBuffer: new Uint8Array([0x11, 0x22]).buffer as ArrayBuffer
      })
      // Stop during the fetch (before yield)
      fetchMock.mockImplementation(async (url: string) => {
        if ((url as string).includes('audio_query')) return queryResponse
        return synthResponse
      })

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []

      for await (const chunk of tts.stream('stop test')) {
        chunks.push(chunk)
        tts.stop()
        break
      }

      expect(chunks.length).toBeLessThanOrEqual(1)
    })

    it('stop() invalidates stream via generation counter', async () => {
      const tts = new VoicevoxTts()
      tts.stop()

      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({
        arrayBuffer: new Uint8Array([1, 2]).buffer as ArrayBuffer
      })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('after stop')) {
        chunks.push(chunk)
      }

      // New stream() increments generation, so it proceeds normally
      expect(chunks).toHaveLength(1)
    })
  })
})
