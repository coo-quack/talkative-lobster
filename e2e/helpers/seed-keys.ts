import type { Page } from '@playwright/test'

/**
 * Seed dummy API keys via the renderer's preload API (window.lobster.setKey)
 * so that health checks pass (they bail early if keys are missing).
 */
export async function seedTestKeys(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const lobster = (
      window as unknown as {
        lobster: { setKey: (n: string, v: string) => Promise<void> }
      }
    ).lobster
    await lobster.setKey('GATEWAY_TOKEN', 'test-gateway-token')
    await lobster.setKey('ELEVENLABS_API_KEY', 'test-elevenlabs-key')
    await lobster.setKey('OPENAI_API_KEY', 'test-openai-key')
  })
}
