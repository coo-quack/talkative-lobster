import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)
import type { ITtsProvider } from './tts-provider'

export class PiperTts implements ITtsProvider {
  private binaryPath: string
  private modelPath: string
  private stopped = false

  get isStopped(): boolean {
    return this.stopped
  }

  constructor(binaryPath: string, modelPath: string) {
    this.binaryPath = binaryPath
    this.modelPath = modelPath
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    this.stopped = false

    const dir = mkdtempSync(join(tmpdir(), 'lobster-piper-'))
    const inputPath = join(dir, 'input.txt')
    const outputPath = join(dir, 'output.wav')

    try {
      writeFileSync(inputPath, text)

      await execFileAsync(this.binaryPath, [
        '--model', this.modelPath,
        '--input-file', inputPath,
        '--output-file', outputPath,
      ], { timeout: 30_000 })

      if (!this.stopped) {
        const wav = readFileSync(outputPath)
        yield wav
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  setPaths(binaryPath: string, modelPath: string): void {
    this.binaryPath = binaryPath
    this.modelPath = modelPath
  }

  stop(): void {
    this.stopped = true
  }
}
