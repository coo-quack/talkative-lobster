import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

import type { ITtsProvider, TtsAudioFormat } from './tts-provider'

export class PiperTts implements ITtsProvider {
  private binaryPath: string
  private modelPath: string
  private generation = 0

  readonly audioFormat: TtsAudioFormat = { type: 'encoded' }

  constructor(binaryPath: string, modelPath: string) {
    this.binaryPath = binaryPath
    this.modelPath = modelPath
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    const gen = ++this.generation

    const dir = await mkdtemp(join(tmpdir(), 'lobster-piper-'))
    const inputPath = join(dir, 'input.txt')
    const outputPath = join(dir, 'output.wav')

    try {
      await writeFile(inputPath, text)

      await execFileAsync(
        this.binaryPath,
        ['--model', this.modelPath, '--input-file', inputPath, '--output-file', outputPath],
        { timeout: 30_000 }
      )

      if (gen === this.generation) {
        const wav = await readFile(outputPath)
        yield wav
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  stop(): void {
    this.generation++
  }
}
