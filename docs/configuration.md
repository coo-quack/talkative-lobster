# Configuration

All configuration is done through the Settings modal in the app. API keys are encrypted via Electron's `safeStorage`; other settings are stored as local JSON.

## Settings Modal

The Settings modal opens automatically on first launch if required keys are missing. You can reopen it anytime by clicking the **Settings** button on the main screen. It has three sections:

### Gateway

| Setting | Description | Default |
|---------|-------------|---------|
| Gateway URL | WebSocket URL for the OpenClaw gateway | `ws://localhost:3000` |

The gateway connects to an [OpenClaw](https://github.com/coo-quack/openclaw) instance that routes requests to your configured LLM.

### Speech-to-Text

| Setting | Description |
|---------|-------------|
| Provider | Select STT provider (ElevenLabs Scribe, OpenAI Whisper, whisper.cpp) |
| API Key | Required for cloud providers (ElevenLabs, OpenAI) |

See [Providers](/providers#speech-to-text-stt) for details on each provider.

### Text-to-Speech

| Setting | Description |
|---------|-------------|
| Provider | Select TTS provider (ElevenLabs, VOICEVOX, Kokoro, Piper) |
| API Key | Required for ElevenLabs |
| Voice | Voice selection (provider-specific) |

See [Providers](/providers#text-to-speech-tts) for details on each provider.

## API Key Storage

API keys are encrypted using Electron's [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) API before being written to disk. On macOS, this uses the system Keychain. On Windows, it uses DPAPI. On Linux, it uses the Secret Service API or libsecret.

Keys never leave your machine unencrypted.

## OpenClaw Gateway

Talkative Lobster communicates with LLMs through an [OpenClaw](https://github.com/coo-quack/openclaw) gateway. OpenClaw is a local WebSocket server that:

- Routes requests to your configured LLM provider (OpenAI, Anthropic, local models, etc.)
- Streams response tokens back in real-time
- Manages conversation context

### Setup

1. Install and start OpenClaw: see [OpenClaw README](https://github.com/coo-quack/openclaw)
2. Enter the gateway URL in Talkative Lobster's Settings modal (default: `ws://localhost:3000`)
3. The connection status is shown in the app UI
