import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)
import type { ITtsProvider, TtsAudioFormat } from './tts-provider'

export class PiperTts implements ITtsProvider {
  private binaryPath: string
  private modelPath: string
  private generation = 0

  readonly audioFormat: TtsAudioFormat = { type: 'encoded' }

  get isStopped(): boolean {
    return false
  }

  constructor(binaryPath: string, modelPath: string) {
    this.binaryPath = binaryPath
    this.modelPath = modelPath
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    const gen = ++this.generation

    const dir = mkdtempSync(join(tmpdir(), 'lobster-piper-'))
    const inputPath = join(dir, 'input.txt')
    const outputPath = join(dir, 'output.wav')

    try {
      writeFileSync(inputPath, text)

      await execFileAsync(
        this.binaryPath,
        ['--model', this.modelPath, '--input-file', inputPath, '--output-file', outputPath],
        { timeout: 30_000 }
      )

      if (gen === this.generation) {
        const wav = readFileSync(outputPath)
        yield wav
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  stop(): void {
    this.generation++
  }
}
