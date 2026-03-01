import type { ElectronApplication } from '@playwright/test'

export async function installFetchMock(app: ElectronApplication): Promise<void> {
  await app.evaluate(async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      // Gateway health check
      if (url.includes('127.0.0.1:18789')) {
        return new Response('OK', { status: 200 })
      }
      // ElevenLabs API check
      if (url.includes('api.elevenlabs.io/v1/user')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      // OpenAI API check
      if (url.includes('api.openai.com/v1/models')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      // VOICEVOX version check
      if (url.includes('/version') && url.includes('50021')) {
        return new Response('"0.14.2"', { status: 200 })
      }
      // Kokoro models check
      if (url.includes('/v1/models') && url.includes('8880')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return originalFetch(input, init)
    }
  })
}
