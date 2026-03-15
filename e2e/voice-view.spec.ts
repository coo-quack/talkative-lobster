import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { closeApp, launchApp, passChecksAndStart } from './helpers/app-setup'

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  const ctx = await launchApp()
  app = ctx.app
  window = ctx.window
  await passChecksAndStart(window)
})

test.afterAll(async () => {
  await closeApp({ app, window })
})

// ── VoiceView UI ─────────────────────────────────────────────────

test.describe('VoiceView', () => {
  test('shows app title in header', async () => {
    await expect(window.locator('text=Talkative Lobster')).toBeVisible()
  })

  test('shows Ready or Listening status label', async () => {
    // With VAD active, idle state may show "Listening..." instead of "Ready"
    const ready = window.locator('text=Ready')
    const listening = window.locator('text=Listening...')
    const calibrating = window.locator('text=Calibrating...')
    await expect(ready.or(listening).or(calibrating)).toBeVisible({ timeout: 5000 })
  })

  test('shows mic ON button', async () => {
    const micBtn = window.locator('button', { hasText: 'ON' })
    await expect(micBtn).toBeVisible()
  })

  test('shows STOP button', async () => {
    const stopBtn = window.locator('button', { hasText: 'STOP' })
    await expect(stopBtn).toBeVisible()
  })

  test('STOP button is disabled in idle state', async () => {
    const stopBtn = window.locator('button', { hasText: 'STOP' })
    await expect(stopBtn).toBeDisabled()
  })

  test('shows settings button', async () => {
    // Settings button is the last button in the footer
    const settingsBtn = window.locator('button').last()
    await expect(settingsBtn).toBeVisible()
  })

  test('mic toggle switches to OFF', async () => {
    const micBtn = window.locator('button', { hasText: 'ON' })
    await micBtn.click()

    // Should now show OFF
    await expect(window.locator('button', { hasText: 'OFF' })).toBeVisible()
    // Status should show Offline
    await expect(window.locator('text=Offline')).toBeVisible()
  })

  test('mic toggle switches back to ON', async () => {
    const micBtn = window.locator('button', { hasText: 'OFF' })
    await micBtn.click()

    await expect(window.locator('button', { hasText: 'ON' })).toBeVisible()
    // Status should show Ready (or Listening if VAD starts)
    const status = window.locator('text=Ready')
    const listening = window.locator('text=Listening...')
    // One of them should be visible
    await expect(status.or(listening)).toBeVisible({ timeout: 5000 })
  })

  test('settings button navigates to settings and back', async () => {
    // Click settings button (last button in footer)
    const settingsBtn = window.locator('button').last()
    await settingsBtn.click()

    // Should show settings modal
    await expect(window.locator('h2', { hasText: 'Settings' })).toBeVisible({ timeout: 5000 })

    // Run checks and click Start Lobster to go back
    for (let i = 0; i < 3; i++) {
      const check = window.locator('.connectivity-check').nth(i)
      await check.locator('.check-btn').click()
      await expect(check.locator('.check-result.ok')).toBeVisible({ timeout: 10000 })
    }

    const startBtn = window.locator('button', { hasText: 'Start Lobster' })
    await expect(startBtn).toBeEnabled()
    await startBtn.click()

    // Should be back in VoiceView
    await expect(window.locator('text=Talkative Lobster')).toBeVisible({ timeout: 5000 })
  })

  test('connection status dot is visible in header', async () => {
    // The status dot button is in the header
    const dot = window.locator('button[title="Connected"]')
    await expect(dot).toBeVisible()
  })
})
