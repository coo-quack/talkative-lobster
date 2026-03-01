import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFile, mockWriteFileSync, mockReadFileSync, mockRmSync, mockMkdtempSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(null, '', '')),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockMkdtempSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: mockExecFile }))
vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  rmSync: mockRmSync,
  mkdtempSync: mockMkdtempSync,
}))

import { PiperTts } from '../tts/piper-tts'

describe('PiperTts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockMkdtempSync.mockReturnValue('/tmp/lobster-piper-xyz')
    mockReadFileSync.mockReturnValue(Buffer.from('RIFF-wav-data'))
  })

  describe('constructor', () => {
    it('creates an instance with isStopped defaulting to false', () => {
      const tts = new PiperTts('/usr/local/bin/piper', '/models/en.onnx')
      expect(tts.isStopped).toBe(false)
    })
  })

  describe('stream()', () => {
    it('writes input text to a file and calls piper with correct args', async () => {
      const tts = new PiperTts('/usr/local/bin/piper', '/models/en.onnx')
      for await (const _ of tts.stream('hello')) { /* drain */ }

      expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/lobster-piper-xyz/input.txt', 'hello')
      expect(mockExecFile).toHaveBeenCalledWith(
        '/usr/local/bin/piper',
        ['--model', '/models/en.onnx', '--input-file', '/tmp/lobster-piper-xyz/input.txt', '--output-file', '/tmp/lobster-piper-xyz/output.wav'],
        { timeout: 30_000 },
        expect.any(Function),
      )
    })

    it('yields the WAV file as a single buffer', async () => {
      const wavData = Buffer.from('RIFF-test-wav')
      mockReadFileSync.mockReturnValue(wavData)

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
      for await (const _ of tts.stream('cleanup')) { /* drain */ }

      expect(mockRmSync).toHaveBeenCalledWith('/tmp/lobster-piper-xyz', { recursive: true, force: true })
    })

    it('cleans up temp directory even on error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(new Error('piper failed')))

      const tts = new PiperTts('/bin/piper', '/model.onnx')
      await expect(async () => {
        for await (const _ of tts.stream('fail')) { /* drain */ }
      }).rejects.toThrow('piper failed')

      expect(mockRmSync).toHaveBeenCalledWith('/tmp/lobster-piper-xyz', { recursive: true, force: true })
    })

    it('yields nothing when stopped before read', async () => {
      const tts = new PiperTts('/bin/piper', '/model.onnx')
      tts.stop()

      // Reset stopped on stream entry, but execFile runs asynchronously,
      // so we stop after exec but before yield by mocking execFile to call stop
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => { tts.stop(); cb(null, '', '') })

      const received: Buffer[] = []
      for await (const chunk of tts.stream('stopped')) {
        received.push(chunk)
      }
      expect(received).toHaveLength(0)
    })
  })

  describe('stop()', () => {
    it('sets isStopped to true', () => {
      const tts = new PiperTts('/bin/piper', '/model.onnx')
      tts.stop()
      expect(tts.isStopped).toBe(true)
    })
  })

  describe('isStopped', () => {
    it('resets to false at the start of each stream() call', async () => {
      const tts = new PiperTts('/bin/piper', '/model.onnx')
      tts.stop()
      expect(tts.isStopped).toBe(true)

      for await (const _ of tts.stream('reset')) { /* drain */ }
      expect(tts.isStopped).toBe(false)
    })
  })

  describe('setPaths()', () => {
    it('updates binary and model paths', async () => {
      const tts = new PiperTts('/old/piper', '/old/model.onnx')
      tts.setPaths('/new/piper', '/new/model.onnx')

      for await (const _ of tts.stream('test')) { /* drain */ }

      expect(mockExecFile).toHaveBeenCalledWith(
        '/new/piper',
        expect.arrayContaining(['/new/model.onnx']),
        expect.any(Object),
        expect.any(Function),
      )
    })
  })
})
