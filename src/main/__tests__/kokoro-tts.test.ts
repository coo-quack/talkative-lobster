import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KokoroTts } from '../tts/kokoro-tts'
import type { ITtsProvider } from '../tts/tts-provider'

const makeOkResponse = (data: Uint8Array): Response => {
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(data.buffer as ArrayBuffer)
  } as unknown as Response
}

const makeErrorResponse = (status: number): Response => {
  return {
    ok: false,
    status,
    arrayBuffer: () => Promise.reject(new Error('should not be called'))
  } as unknown as Response
}

describe('KokoroTts', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('constructor defaults', () => {
    it('defaults url to http://localhost:8880', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([1, 2, 3])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:8880/v1/audio/speech')
    })

    it('defaults voice to jf_alpha', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([1, 2, 3])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.voice).toBe('jf_alpha')
    })

    it('satisfies the ITtsProvider interface', () => {
      const tts: ITtsProvider = new KokoroTts()
      expect(typeof tts.stream).toBe('function')
      expect(typeof tts.stop).toBe('function')
      expect(typeof tts.isStopped).toBe('boolean')
    })

    it('isStopped is false initially', () => {
      const tts = new KokoroTts()
      expect(tts.isStopped).toBe(false)
    })

    it('exposes encoded audio format', () => {
      const tts = new KokoroTts()
      expect(tts.audioFormat).toEqual({ type: 'encoded' })
    })
  })

  describe('constructor with explicit arguments', () => {
    it('accepts a custom url', async () => {
      const tts = new KokoroTts('http://example.com:9000')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://example.com:9000/v1/audio/speech')
    })

    it('accepts a custom voice', async () => {
      const tts = new KokoroTts(undefined, 'am_adam')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.voice).toBe('am_adam')
    })
  })

  describe('stream()', () => {
    it('sends a POST request to /v1/audio/speech', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([10, 20])))

      for await (const _ of tts.stream('Hello world')) {
        /* drain */
      }

      expect(fetchMock).toHaveBeenCalledOnce()
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(init.method).toBe('POST')
    })

    it('sends Content-Type: application/json header', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('test')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('sends correct body fields', async () => {
      const tts = new KokoroTts('http://localhost:8880', 'jf_alpha')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('Say something')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({
        model: 'kokoro',
        input: 'Say something',
        voice: 'jf_alpha',
        response_format: 'mp3'
      })
    })

    it('yields the full response buffer as a single Buffer', async () => {
      const tts = new KokoroTts()
      const audioData = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      fetchMock.mockResolvedValue(makeOkResponse(audioData))

      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('Hello')) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBeInstanceOf(Buffer)
      expect(Array.from(chunks[0])).toEqual([0xde, 0xad, 0xbe, 0xef])
    })

    it('resets isStopped to false at the start of each call', async () => {
      const tts = new KokoroTts()
      tts.stop()
      expect(tts.isStopped).toBe(true)

      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([1])))
      const gen = tts.stream('reset test')
      await gen.next() // advance past the fetch + yield
      await gen.return(undefined)

      expect(tts.isStopped).toBe(false)
    })

    it('throws on a non-OK response', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeErrorResponse(503))

      await expect(async () => {
        for await (const _ of tts.stream('fail')) {
          /* drain */
        }
      }).rejects.toThrow('Kokoro TTS failed: 503')
    })

    it('includes the HTTP status code in the error message', async () => {
      const tts = new KokoroTts()
      fetchMock.mockResolvedValue(makeErrorResponse(422))

      await expect(async () => {
        for await (const _ of tts.stream('bad input')) {
          /* drain */
        }
      }).rejects.toThrow('422')
    })
  })

  describe('stop()', () => {
    it('sets isStopped to true', () => {
      const tts = new KokoroTts()
      tts.stop()
      expect(tts.isStopped).toBe(true)
    })

    it('prevents the buffer from being yielded when stop() is called before yield', async () => {
      const tts = new KokoroTts()

      // Intercept fetch and call stop() before the response resolves
      fetchMock.mockImplementation(async () => {
        tts.stop()
        return makeOkResponse(new Uint8Array([1, 2, 3]))
      })

      const chunks: Buffer[] = []
      for await (const chunk of tts.stream('interrupted')) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
    })
  })

  describe('setUrl()', () => {
    it('updates the URL used in subsequent requests', async () => {
      const tts = new KokoroTts()
      tts.setUrl('http://newhost:7777')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://newhost:7777/v1/audio/speech')
    })

    it('does not affect the current voice setting', async () => {
      const tts = new KokoroTts(undefined, 'am_adam')
      tts.setUrl('http://other:9999')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.voice).toBe('am_adam')
    })
  })

  describe('setVoice()', () => {
    it('updates the voice used in subsequent requests', async () => {
      const tts = new KokoroTts()
      tts.setVoice('am_adam')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.voice).toBe('am_adam')
    })

    it('does not affect the current URL setting', async () => {
      const tts = new KokoroTts('http://custom:5000')
      tts.setVoice('jf_beta')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://custom:5000/v1/audio/speech')
    })

    it('can be changed multiple times', async () => {
      const tts = new KokoroTts()
      tts.setVoice('voice_a')
      tts.setVoice('voice_b')
      tts.setVoice('voice_c')
      fetchMock.mockResolvedValue(makeOkResponse(new Uint8Array([0])))

      for await (const _ of tts.stream('hi')) {
        /* drain */
      }

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.voice).toBe('voice_c')
    })
  })
})
