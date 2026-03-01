# Talkative Lobster

**Talk to your AI — literally.**

Talkative Lobster is a desktop voice conversation app. Speak into your mic, and an AI responds out loud. No typing, no copy-pasting — just natural back-and-forth conversation on your desktop.

## How It Works

```
You speak  -->  Speech-to-Text  -->  LLM  -->  Text-to-Speech  -->  You hear
```

1. **You talk** — Silero VAD detects when you start and stop speaking
2. **STT converts your voice** — via ElevenLabs Scribe, OpenAI Whisper, or local whisper.cpp
3. **LLM thinks** — powered by [OpenClaw](https://github.com/coo-quack/openclaw) gateway
4. **TTS speaks back** — choose from ElevenLabs, VOICEVOX, Kokoro, or Piper
5. **Interrupt anytime** — just start talking to cut in mid-response

## Features

- **Voice Activity Detection** — neural network-based (Silero VAD), no push-to-talk needed
- **Multi-provider STT** — ElevenLabs Scribe, OpenAI Whisper, local whisper.cpp
- **Multi-provider TTS** — ElevenLabs, VOICEVOX (Japanese), Kokoro (JP + EN), Piper (local)
- **Natural interruption** — speak over the AI to interrupt and redirect
- **Speaker monitor** — filters out system audio (YouTube, music) so only your voice triggers the AI
- **Encrypted key storage** — API keys stored securely via Electron's safeStorage

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- An [OpenClaw](https://github.com/coo-quack/openclaw) gateway running locally

### Install & Run

```bash
pnpm install
pnpm dev
```

On first launch, the Settings modal walks you through connecting your gateway and choosing STT/TTS providers.

### Build

```bash
# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```

## Architecture

```
src/
  main/              # Electron main process
    orchestrator.ts   #   Central IPC + engine coordination
    voice-machine.ts  #   xstate state machine (idle -> listening -> processing -> thinking -> speaking)
    openclaw-client.ts#   WebSocket client for OpenClaw gateway
    stt-engine.ts     #   Multi-provider speech-to-text
    tts/              #   TTS provider implementations
  preload/            # contextBridge (window.lobster API)
  renderer/           # React 19 UI
    hooks/            #   useVAD, useTtsPlayback, useSpeakerMonitor, etc.
    components/       #   VoiceView, SetupModal, Waveform
  shared/             # Types and IPC channel definitions
```

## Testing

```bash
# Unit tests (171 tests)
pnpm test

# E2E tests (34 tests)
pnpm test:e2e
```

## License

Private — not open source.
