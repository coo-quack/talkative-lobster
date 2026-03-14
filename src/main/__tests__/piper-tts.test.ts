import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecFile, mockWriteFile, mockReadFile, mockRm, mockMkdtemp } = vi.hoisted(() => ({
  mockExecFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout?: string, stderr?: string) => void
    ) => cb(null, '', '')
  ),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockReadFile: vi.fn(),
  mockRm: vi.fn().mockResolvedValue(undefined),
  mockMkdtemp: vi.fn()
}))

vi.mock('node:child_process', () => ({ execFile: mockExecFile }))
vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  rm: mockRm,
  mkdtemp: mockMkdtemp
}))

import { PiperTts } from '../tts/piper-tts'

describe('PiperTts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockMkdtemp.mockResolvedValue('/tmp/lobster-piper-xyz')
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('RIFF-wav-data'))
  })

  describe('constructor', () => {
    it('exposes encoded audio format', () => {
      const tts = new PiperTts('/usr/local/bin/piper', '/models/en.onnx')
      expect(tts.audioFormat).toEqual({ type: 'encoded' })
    })
  })

  describe('stream()', () => {
    it('writes input text to a file and calls piper with correct args', async () => {
      const tts = new PiperTts('/usr/local/bin/piper', '/models/en.onnx')
      for await (const _ of tts.stream('hello')) {
        /* drain */
      }

      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/lobster-piper-xyz/input.txt', 'hello')
      expect(mockExecFile).toHaveBeenCalledWith(
        '/usr/local/bin/piper',
        [
          '--model',
          '/models/en.onnx',
          '--input-file',
          '/tmp/lobster-piper-xyz/input.txt',
          '--output-file',
          '/tmp/lobster-piper-xyz/output.wav'
        ],
        { timeout: 30_000 },
        expect.any(Function)
      )
    })

    it('yields the WAV file as a single buffer', async () => {
      const wavData = Buffer.from('RIFF-test-wav')
      mockReadFile.mockResolvedValue(wavData)

      const tts = new PiperTts('/bin/piper', '/model.onnx')
      const received: Buffer[] = []
      for await (const chunk of tts.stream('test')) {
        received.push(chunk)
      }

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual(wavData)
    })

    it('cleans up temp directory after completion', async () => {
      const tts = new PiperTts('/bin/piper', '/model.onnx')
      for await (const _ of tts.stream('cleanup')) {
        /* drain */
      }

      expect(mockRm).toHaveBeenCalledWith('/tmp/lobster-piper-xyz', {
        recursive: true,
        force: true
      })
    })

    it('cleans up temp directory even on error', async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout?: string, stderr?: string) => void
        ) => cb(new Error('piper failed'))
      )

      const tts = new PiperTts('/bin/piper', '/model.onnx')
      await expect(async () => {
        for await (const _ of tts.stream('fail')) {
          /* drain */
        }
      }).rejects.toThrow('piper failed')

      expect(mockRm).toHaveBeenCalledWith('/tmp/lobster-piper-xyz', {
        recursive: true,
        force: true
      })
    })

    it('yields nothing when stopped before read', async () => {
      const tts = new PiperTts('/bin/piper', '/model.onnx')
      tts.stop()

      // Reset stopped on stream entry, but execFile runs asynchronously,
      // so we stop after exec but before yield by mocking execFile to call stop
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout?: string, stderr?: string) => void
        ) => {
          tts.stop()
          cb(null, '', '')
        }
      )

      const received: Buffer[] = []
      for await (const chunk of tts.stream('stopped')) {
        received.push(chunk)
      }
      expect(received).toHaveLength(0)
    })
  })
})
