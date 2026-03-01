# Providers

Talkative Lobster supports multiple speech-to-text (STT) and text-to-speech (TTS) providers. Choose the combination that best fits your needs.

## Speech-to-Text (STT)

| Provider | Type | Languages | API Key |
|----------|------|-----------|---------|
| ElevenLabs Scribe | Cloud | Multilingual | Required |
| OpenAI Whisper | Cloud | Multilingual | Required |
| whisper.cpp | Local | Multilingual | Not needed |

### ElevenLabs Scribe

High-accuracy cloud STT. Supports many languages with fast turnaround.

- **API key**: Get one at [elevenlabs.io](https://elevenlabs.io)
- **Best for**: Production-quality transcription

### OpenAI Whisper

OpenAI's cloud-hosted Whisper model. Reliable and widely supported.

- **API key**: Get one at [platform.openai.com](https://platform.openai.com)
- **Best for**: General-purpose transcription

### whisper.cpp

Runs Whisper locally on your machine. No API key needed, no data leaves your device.

- **Requirements**: Downloads model on first use
- **Best for**: Privacy-conscious use, offline operation

## Text-to-Speech (TTS)

| Provider | Type | Languages | API Key |
|----------|------|-----------|---------|
| ElevenLabs | Cloud | Multilingual | Required |
| VOICEVOX | Local | Japanese | Not needed |
| Kokoro | Local | Japanese, English | Not needed |
| Piper | Local | Many languages | Not needed |

### ElevenLabs

High-quality cloud TTS with natural-sounding voices and many voice options.

- **API key**: Same key as ElevenLabs Scribe
- **Best for**: Natural-sounding English voices

### VOICEVOX

Free, open-source TTS engine focused on Japanese. Runs as a local server.

- **Requirements**: [VOICEVOX](https://voicevox.hiroshiba.jp/) must be running locally
- **Best for**: Japanese voice synthesis

### Kokoro

Local TTS supporting both Japanese and English. Lightweight and fast.

- **Requirements**: Downloads model on first use
- **Best for**: Bilingual (JP/EN) conversations

### Piper

Fast, local TTS with support for many languages. Runs entirely on your machine.

- **Requirements**: Downloads voice model on first use
- **Best for**: Low-latency local TTS, many language options
