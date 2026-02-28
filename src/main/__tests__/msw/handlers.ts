import { http, HttpResponse } from 'msw'

export const handlers = [
  // ElevenLabs STT (speech-to-text)
  http.post('https://api.elevenlabs.io/v1/speech-to-text', () =>
    HttpResponse.json({
      language_code: 'jpn',
      language_probability: 0.98,
      text: 'こんにちは',
      words: [
        { text: 'こんにちは', start: 0.0, end: 1.0, type: 'word', logprob: -0.1 },
      ],
    }),
  ),

  // ElevenLabs TTS streaming
  http.post(
    'https://api.elevenlabs.io/v1/text-to-speech/:voiceId/stream',
    () => {
      const chunk1 = new Uint8Array([0x00, 0x01, 0x02, 0x03])
      const chunk2 = new Uint8Array([0x04, 0x05, 0x06, 0x07])
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1)
          controller.enqueue(chunk2)
          controller.close()
        },
      })
      return new HttpResponse(stream, {
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    },
  ),

  // OpenAI Whisper transcription
  http.post('https://api.openai.com/v1/audio/transcriptions', () =>
    HttpResponse.json({ text: 'hello world' }),
  ),
]
