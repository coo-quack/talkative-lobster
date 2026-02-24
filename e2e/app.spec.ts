import { test, expect, _electron as electron } from '@playwright/test'
import path from 'node:path'

test.describe('Budgie App', () => {
  test('launches and shows setup modal', async () => {
    const app = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    })
    const window = await app.firstWindow()

    // Wait for the app to load
    await window.waitForLoadState('domcontentloaded')

    // Should show setup modal on first launch
    const heading = window.locator('h2')
    await expect(heading).toContainText('Welcome to Budgie')

    await app.close()
  })
})
