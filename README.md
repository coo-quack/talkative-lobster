# Talkative Lobster

[![CI](https://github.com/coo-quack/talkative-lobster/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/coo-quack/talkative-lobster/actions/workflows/ci.yml)

**Talk to your AI — literally.**

A desktop voice conversation app. Speak into your mic, and an AI responds out loud. No typing, no copy-pasting — just natural back-and-forth conversation on your desktop.

📖 **[Documentation](https://coo-quack.github.io/talkative-lobster/)** — Setup guides, provider configuration, and troubleshooting.

---

## How It Works

```
You speak  →  Speech-to-Text  →  LLM  →  Text-to-Speech  →  You hear
```

1. **You talk** — Silero VAD detects when you start and stop speaking
2. **STT converts your voice** — via ElevenLabs Scribe, OpenAI Whisper, or local whisper.cpp
3. **LLM thinks** — powered by [OpenClaw](https://github.com/coo-quack/openclaw) gateway
4. **TTS speaks back** — choose from ElevenLabs, VOICEVOX, Kokoro, or Piper
5. **Interrupt anytime** — just start talking to cut in mid-response

## Features

- **Voice Activity Detection** — neural network-based (Silero VAD) with auto noise calibration
- **Multi-provider STT** — ElevenLabs Scribe, OpenAI Whisper, local whisper.cpp
- **Multi-provider TTS** — ElevenLabs, VOICEVOX (Japanese), Kokoro (JP + EN), Piper (local)
- **Natural interruption** — speak over the AI to interrupt and redirect
- **Speaker monitor** — filters out system audio so only your voice triggers the AI
- **Aizuchi** — subtle audio cues during thinking state to fill silence
- **Encrypted key storage** — API keys stored with AES-256-CBC encryption on your machine

## Download

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [TalkLob-arm64.dmg](https://github.com/coo-quack/talkative-lobster/releases/latest/download/talkative-lobster-arm64.dmg) |
| macOS (Intel) | [TalkLob-x64.dmg](https://github.com/coo-quack/talkative-lobster/releases/latest/download/talkative-lobster-x64.dmg) |
| Windows | [TalkLob-setup.exe](https://github.com/coo-quack/talkative-lobster/releases/latest/download/talkative-lobster-x64-setup.exe) |
| Linux (AppImage) | [TalkLob.AppImage](https://github.com/coo-quack/talkative-lobster/releases/latest/download/talkative-lobster-x86_64.AppImage) |
| Linux (deb) | [TalkLob.deb](https://github.com/coo-quack/talkative-lobster/releases/latest/download/talkative-lobster-amd64.deb) |

See all releases on the [Releases page](https://github.com/coo-quack/talkative-lobster/releases).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- An [OpenClaw](https://github.com/coo-quack/openclaw) gateway running locally

### Install & Run

```bash
git clone https://github.com/coo-quack/talkative-lobster.git
cd talkative-lobster
pnpm install
pnpm dev
```

On first launch, the Settings modal walks you through connecting your gateway and choosing STT/TTS providers.

### Build

```bash
# macOS
pnpm build && pnpm exec electron-builder --mac

# Windows
pnpm build && pnpm exec electron-builder --win

# Linux
pnpm build && pnpm exec electron-builder --linux
```

## Testing

```bash
pnpm test          # Unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright)
pnpm typecheck     # TypeScript type checking
pnpm lint          # Biome linter
pnpm format:check  # Biome formatter
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, branch strategy, and code quality standards.

## License

Private — not open source.
