# Getting Started

Get Talkative Lobster running on your machine in a few minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- An [OpenClaw](https://github.com/coo-quack/openclaw) gateway running locally

## Install & Run

```bash
git clone https://github.com/coo-quack/talkative-lobster.git
cd talkative-lobster
pnpm install
pnpm dev
```

## First Launch

On first launch, the **Settings modal** opens automatically and walks you through:

1. **OpenClaw Gateway** — enter your `GATEWAY_TOKEN` (default URL: `ws://127.0.0.1:18789`)
2. **STT Provider** — choose a speech-to-text provider and enter API keys if needed
3. **TTS Provider** — choose a text-to-speech provider and configure voice settings

Once configured, close the modal and start talking. The app detects your voice automatically.

## Build

Build distributable packages for your platform:

```bash
# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e
```
