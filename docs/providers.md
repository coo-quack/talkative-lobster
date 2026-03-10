# Providers

Talkative Lobster supports multiple speech-to-text (STT) and text-to-speech (TTS) providers. Choose the combination that best fits your needs.

## Speech-to-Text (STT)

| Provider | Type | Languages | API Key | Latency |
|----------|------|-----------|---------|---------|
| ElevenLabs Scribe | Cloud | Multilingual | Required | Low |
| OpenAI Whisper | Cloud | Multilingual | Required | Low |
| whisper.cpp | Local | Multilingual | Not needed | Medium |

### ElevenLabs Scribe

High-accuracy cloud STT using ElevenLabs' Scribe v2 model.

- **API key**: Get one at [elevenlabs.io](https://elevenlabs.io)
- **Model**: `scribe_v2` (fixed)
- **Timeout**: 5 seconds
- **Best for**: Production-quality multilingual transcription

### OpenAI Whisper

OpenAI's cloud-hosted Whisper model (`whisper-1`).

- **API key**: Get one at [platform.openai.com](https://platform.openai.com)
- **Timeout**: 5 seconds
- **Best for**: General-purpose transcription

### whisper.cpp

Runs Whisper locally on your machine. No data leaves your device.

- **Binary**: You need the `whisper-cli` binary — build from [whisper.cpp](https://github.com/ggerganov/whisper.cpp) or install via Homebrew: `brew install whisper-cpp`
- **Model**: `ggml-medium.bin` — automatically downloaded to `~/.config/lobster/models/` on first use
- **Language**: Hardcoded to Japanese (`--language ja`)
- **Timeout**: 60 seconds
- **Best for**: Privacy-conscious use, offline operation

::: tip STT Fallback
If multiple providers are configured with valid keys, the app tries providers in order (ElevenLabs → OpenAI → whisper.cpp) and uses the first successful result.
:::

---

## Text-to-Speech (TTS)

| Provider | Type | Languages | API Key | Streaming |
|----------|------|-----------|---------|-----------|
| ElevenLabs | Cloud | Multilingual | Required | Yes |
| VOICEVOX | Local | Japanese | Not needed | No |
| Kokoro | Local | Japanese, English | Not needed | No |
| Piper | Local | Many | Not needed | No |

### ElevenLabs

High-quality cloud TTS with natural-sounding voices and real-time streaming.

- **API key**: Same as ElevenLabs Scribe (`ELEVENLABS_API_KEY`)
- **Output format**: PCM 24kHz, 16-bit mono (streamed)

#### Voices

| Voice | ID |
|-------|-----|
| Morioki | `KnMBELSmBGHPqfZxMRw6` |
| Lily (default) | `pFZP5JQG7iQjIQuC4Bku` |
| Alice | `Xb7hH8MSUJpSbSDYk0k2` |
| Matilda | `XrExE9yKIg1WjnnlVkGX` |
| Sarah | `EXAVITQu4vr4xnSDxMaL` |
| Daniel | `onwK4e9ZLuTAKqWW03F9` |
| Brian | `nPczCjzI2devNBz1zQrb` |
| George | `JBFqnCBsd6RMkjVDRZzb` |
| Liam | `TX3LPaxmHKxFdv7VOQHJ` |

#### Models

| Model | Description |
|-------|-------------|
| `eleven_multilingual_v2` | Highest quality, multilingual (default) |
| `eleven_turbo_v2_5` | Balanced quality and speed |
| `eleven_flash_v2_5` | Fastest response time |

### VOICEVOX

Free, open-source Japanese TTS engine. Runs as a local HTTP server.

- **Download**: [voicevox.hiroshiba.jp](https://voicevox.hiroshiba.jp/)
- **Server URL**: Default `http://localhost:50021`
- **Speaker ID**: Integer (default: `1`). See VOICEVOX docs for available speakers.
- **Process**: 2-step — `audio_query` then `synthesis`
- **Output format**: WAV

::: warning
VOICEVOX must be running before you start TalkLob. The app connects to its HTTP API.
:::

### Kokoro

Lightweight local TTS supporting Japanese and English.

- **Server URL**: Default `http://localhost:8880`
- **API**: OpenAI-compatible (`POST /v1/audio/speech`)
- **Output format**: MP3

#### Voices

| Voice | Language |
|-------|----------|
| `jf_alpha` (default) | Japanese |
| `jf_gongitsune` | Japanese |
| `jf_nezumi` | Japanese |
| `jf_tebukuro` | Japanese |
| `jm_kumo` | Japanese |
| `af_heart` | English |
| `af_jadzia` | English |
| `af_jessica` | English |

### Piper

Fast local TTS with broad language support. Runs entirely on your machine as a subprocess.

- **Binary**: Download from [Piper releases](https://github.com/rhasspy/piper/releases)
- **Model**: ONNX voice model file (`.onnx`)
- **Timeout**: 30 seconds per synthesis
- **Output format**: WAV

You need to set both the **binary path** and **model path** in Settings.
