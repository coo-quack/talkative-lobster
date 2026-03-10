import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { installFetchMock } from './mock-fetch'

const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')
const LOBSTER_DIR = path.join(os.homedir(), '.config', 'lobster')
const SETTINGS_PATH = path.join(LOBSTER_DIR, 'settings.json')
const KEYS_PATH = path.join(LOBSTER_DIR, 'keys.json')

function backupAndRemove(filePath: string): string | null {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    fs.unlinkSync(filePath)
    return content
  }
  return null
}

function restoreFile(filePath: string, content: string | null): void {
  if (content !== null) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
}

export interface AppContext {
  app: ElectronApplication
  window: Page
}

let savedSettings: string | null = null
let savedKeys: string | null = null

export async function launchApp(): Promise<AppContext> {
  savedSettings = backupAndRemove(SETTINGS_PATH)
  savedKeys = backupAndRemove(KEYS_PATH)

  const args = [MAIN_ENTRY]
  if (process.env.CI) {
    args.push('--no-sandbox', '--disable-gpu')
  }
  const app = await electron.launch({ args })
  const window = await app.firstWindow()
  await installFetchMock(app)
  await window.waitForLoadState('domcontentloaded')
  return { app, window }
}

export async function closeApp(ctx: AppContext): Promise<void> {
  if (ctx?.app) {
    await ctx.app.close()
  }
  restoreFile(SETTINGS_PATH, savedSettings)
  restoreFile(KEYS_PATH, savedKeys)
}

export async function passChecksAndStart(window: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const check = window.locator('.connectivity-check').nth(i)
    await check.locator('.check-btn').click()
    const ok = check.locator('.check-result.ok')
    await ok.waitFor({ state: 'visible', timeout: 10000 })
  }
  const startBtn = window.locator('button', { hasText: 'Start Lobster' })
  await startBtn.waitFor({ state: 'visible' })
  await startBtn.click()
  await window.locator('text=Talkative Lobster').waitFor({ state: 'visible', timeout: 10000 })
}
