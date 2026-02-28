import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoicevoxTts } from '../tts/voicevox-tts'

// Helper to build a minimal ReadableStream that yields Uint8Array chunks.
function makeReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })
}

// Helper to build a mock Response.
function mockResponse(
  opts: {
    ok?: boolean
    status?: number
    json?: unknown
    body?: ReadableStream<Uint8Array> | null
    arrayBuffer?: ArrayBuffer
  } = {},
): Response {
  const ok = opts.ok ?? true
  const status = opts.status ?? (ok ? 200 : 500)
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(opts.json ?? {}),
    body: opts.body !== undefined ? opts.body : makeReadableStream([]),
    arrayBuffer: vi.fn().mockResolvedValue(opts.arrayBuffer ?? new ArrayBuffer(0)),
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
      // Access private field via cast to verify storage.
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
  })

  // ------------------------------------------------------------------
  // 2. stream() – successful round-trip
  // ------------------------------------------------------------------
  describe('stream()', () => {
    it('calls audio_query POST with encoded text and speakerId', async () => {
      const queryResponse = mockResponse({ json: { some: 'query' } })
      const synthResponse = mockResponse({ body: makeReadableStream([]) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts('http://localhost:50021', 3)
      // Drain the generator.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of tts.stream('こんにちは')) {
        // consume
      }

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        `http://localhost:50021/audio_query?text=${encodeURIComponent('こんにちは')}&speaker=3`,
        { method: 'POST' },
      )
    })

    it('calls synthesis POST with the query body and correct headers', async () => {
      const queryData = { speed: 1, pitch: 0 }
      const queryResponse = mockResponse({ json: queryData })
      const synthResponse = mockResponse({ body: makeReadableStream([]) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts('http://localhost:50021', 5)
      for await (const _ of tts.stream('test')) {
        // consume
      }

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:50021/synthesis?speaker=5',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queryData),
        },
      )
    })

    it('yields chunks from the response body stream', async () => {
      const queryResponse = mockResponse({ json: {} })
      // Two chunks of 1 byte each – smaller than CHUNK_SIZE so they accumulate
      // and are flushed at the end.
      const chunk1 = new Uint8Array([0x01, 0x02])
      const chunk2 = new Uint8Array([0x03, 0x04])
      const synthResponse = mockResponse({
        body: makeReadableStream([chunk1, chunk2]),
      })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('hello')) {
        chunks.push(chunk)
      }

      // All 4 bytes should come through (accumulated into one flush because
      // pending < CHUNK_SIZE = 8192).
      expect(chunks.length).toBeGreaterThan(0)
      const all = Buffer.concat(chunks)
      expect(all).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]))
    })

    it('yields a single buffer via arrayBuffer() when body is null', async () => {
      const audioData = new Uint8Array([0xaa, 0xbb, 0xcc]).buffer
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ body: null, arrayBuffer: audioData })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('fallback')) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBe(1)
      expect(chunks[0]).toEqual(Buffer.from(audioData))
    })

    it('splits body into CHUNK_SIZE (8192-byte) pieces', async () => {
      const CHUNK_SIZE = 8 * 1024
      // Send 2.5 × CHUNK_SIZE worth of data in one large Uint8Array.
      const bigData = new Uint8Array(CHUNK_SIZE * 2 + 100).fill(0xff)
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ body: makeReadableStream([bigData]) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('big')) {
        chunks.push(chunk)
      }

      // Expect three pieces: CHUNK_SIZE, CHUNK_SIZE, 100 bytes.
      expect(chunks[0].length).toBe(CHUNK_SIZE)
      expect(chunks[1].length).toBe(CHUNK_SIZE)
      expect(chunks[2].length).toBe(100)
      expect(chunks.length).toBe(3)
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
    it('stops yielding chunks mid-stream when stop() is called', async () => {
      const CHUNK_SIZE = 8 * 1024
      // Three full chunks worth of data.
      const bigData = new Uint8Array(CHUNK_SIZE * 3).fill(0x11)
      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ body: makeReadableStream([bigData]) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      const tts = new VoicevoxTts()
      const chunks: Buffer[] = []

      // Consume only the first yielded chunk, then stop.
      for await (const chunk of tts.stream('stop test')) {
        chunks.push(chunk)
        tts.stop()
        break
      }

      // Exactly one chunk was collected and the generator was stopped.
      expect(chunks.length).toBe(1)
      expect(tts.isStopped).toBe(true)
    })

    it('resets the stopped flag when stream() is called again', async () => {
      const tts = new VoicevoxTts()
      tts.stop()
      expect(tts.isStopped).toBe(true)

      const queryResponse = mockResponse({ json: {} })
      const synthResponse = mockResponse({ body: makeReadableStream([]) })
      fetchMock.mockResolvedValueOnce(queryResponse).mockResolvedValueOnce(synthResponse)

      for await (const _ of tts.stream('reset')) {
        // consume
      }

      // stream() resets stopped to false at the start.
      expect(tts.isStopped).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // 5. isStopped property
  // ------------------------------------------------------------------
  describe('isStopped', () => {
    it('is false by default', () => {
      const tts = new VoicevoxTts()
      expect(tts.isStopped).toBe(false)
    })

    it('is true after stop() is called', () => {
      const tts = new VoicevoxTts()
      tts.stop()
      expect(tts.isStopped).toBe(true)
    })

    it('remains true until stream() is called again', () => {
      const tts = new VoicevoxTts()
      tts.stop()
      expect(tts.isStopped).toBe(true)
      // Still true – no stream() call has been made.
      tts.stop()
      expect(tts.isStopped).toBe(true)
    })
  })
})
