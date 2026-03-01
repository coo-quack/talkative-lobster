# Documentation Site Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a VitePress documentation site for Talkative Lobster with 5 pages (Home, Getting Started, Architecture, Providers, Configuration).

**Architecture:** VitePress site in `docs/` directory, following the same pattern as sensitive-canary. Custom theme colors derived from the lobster logo gradient. Deployed to GitHub Pages at `/talkative-lobster/`.

**Tech Stack:** VitePress 1.6.4, custom CSS theme

---

### Task 1: Install VitePress and add npm scripts

**Files:**
- Modify: `package.json`

**Step 1: Install VitePress as a dev dependency**

Run: `pnpm add -D vitepress`

**Step 2: Add docs scripts to package.json**

Add these scripts to the `scripts` section in `package.json`:

```json
"docs:dev": "vitepress dev docs",
"docs:build": "vitepress build docs",
"docs:preview": "vitepress preview docs"
```

**Step 3: Verify installation**

Run: `pnpm docs:dev` — confirm VitePress dev server starts (will show "page not found" since no content yet, that's OK). Stop the server with Ctrl+C.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vitepress and docs scripts"
```

---

### Task 2: Create VitePress config and theme

**Files:**
- Create: `docs/.vitepress/config.ts`
- Create: `docs/.vitepress/theme/index.ts`
- Create: `docs/.vitepress/theme/style.css`

**Step 1: Create VitePress config**

Create `docs/.vitepress/config.ts`:

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Talkative Lobster",
  description:
    "Desktop voice conversation app — speak to your AI and hear it respond",
  base: "/talkative-lobster/",

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Providers", link: "/providers" },
      { text: "GitHub", link: "https://github.com/coo-quack/talkative-lobster" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/getting-started" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Providers", link: "/providers" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/coo-quack/talkative-lobster",
      },
    ],

    footer: {
      message: "Talkative Lobster",
      copyright: "Copyright © 2026 coo-quack",
    },

    search: {
      provider: "local",
    },
  },

  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/talkative-lobster/logo.svg",
      },
    ],
  ],
});
```

**Step 2: Create theme entry**

Create `docs/.vitepress/theme/index.ts`:

```ts
import DefaultTheme from "vitepress/theme";
import "./style.css";

export default DefaultTheme;
```

**Step 3: Create custom theme CSS**

Create `docs/.vitepress/theme/style.css`:

```css
:root {
  --vp-c-brand-1: #8b0310;
  --vp-c-brand-2: #a2040b;
  --vp-c-brand-3: #d4243a;
  --vp-c-brand-soft: rgba(162, 4, 11, 0.12);
}

.dark {
  --vp-c-brand-1: #f94864;
  --vp-c-brand-2: #e83550;
  --vp-c-brand-3: #d4243a;
  --vp-c-brand-soft: rgba(249, 72, 100, 0.16);
}

.vp-doc a {
  color: var(--vp-c-brand-1);
}

.vp-doc a:hover {
  color: var(--vp-c-brand-2);
}
```

**Step 4: Commit**

```bash
git add docs/.vitepress/
git commit -m "feat(docs): add vitepress config and custom theme"
```

---

### Task 3: Add logo to docs public directory

**Files:**
- Create: `docs/public/logo.svg` (copy from `/Users/ai/Desktop/lobster.svg`)

**Step 1: Create public directory and copy logo**

```bash
mkdir -p docs/public
cp /Users/ai/Desktop/lobster.svg docs/public/logo.svg
```

**Step 2: Verify logo is accessible**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/logo.svg` and confirm the logo renders. Stop server.

**Step 3: Commit**

```bash
git add docs/public/logo.svg
git commit -m "feat(docs): add logo asset"
```

---

### Task 4: Create Home page (index.md)

**Files:**
- Create: `docs/index.md`

**Step 1: Write Home page content**

Create `docs/index.md`:

```markdown
---
layout: home

hero:
  name: Talkative Lobster
  text: Talk to your AI — literally
  tagline: A desktop voice conversation app. Speak into your mic, and an AI responds out loud. No typing, no copy-pasting — just natural back-and-forth conversation.
  image:
    src: /logo.svg
    alt: Talkative Lobster
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Providers
      link: /providers
    - theme: alt
      text: GitHub
      link: https://github.com/coo-quack/talkative-lobster

features:
  - icon: 🎙️
    title: Voice Activity Detection
    details: Neural network-based detection (Silero VAD). No push-to-talk needed — just start speaking naturally.
  - icon: 🗣️
    title: Multi-Provider STT
    details: Choose from ElevenLabs Scribe, OpenAI Whisper, or local whisper.cpp for speech-to-text conversion.
  - icon: 🔊
    title: Multi-Provider TTS
    details: ElevenLabs, VOICEVOX (Japanese), Kokoro (JP + EN), and Piper (local) for text-to-speech output.
  - icon: ✋
    title: Natural Interruption
    details: Speak over the AI to interrupt mid-response. The conversation flow adapts immediately.
  - icon: 🔇
    title: Speaker Monitor
    details: Filters out system audio (YouTube, music) so only your voice triggers the AI.
  - icon: 🔐
    title: Encrypted Key Storage
    details: API keys stored securely via Electron's safeStorage. Keys never leave your machine unencrypted.
---

## How It Works

```
You speak → Speech-to-Text → LLM → Text-to-Speech → You hear
```

1. **You talk** — Silero VAD detects when you start and stop speaking
2. **STT converts your voice** — via ElevenLabs Scribe, OpenAI Whisper, or local whisper.cpp
3. **LLM thinks** — powered by [OpenClaw](https://github.com/coo-quack/openclaw) gateway
4. **TTS speaks back** — choose from ElevenLabs, VOICEVOX, Kokoro, or Piper
5. **Interrupt anytime** — just start talking to cut in mid-response

[Get Started →](/getting-started)
```

**Step 2: Verify the page renders**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/` and confirm the hero layout, feature cards, and "How It Works" section render correctly. Stop server.

**Step 3: Commit**

```bash
git add docs/index.md
git commit -m "feat(docs): add home page"
```

---

### Task 5: Create Getting Started page

**Files:**
- Create: `docs/getting-started.md`

**Step 1: Write Getting Started content**

Create `docs/getting-started.md`:

```markdown
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

1. **OpenClaw Gateway** — enter your gateway URL (default: `ws://localhost:3000`)
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
```

**Step 2: Verify the page renders**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/getting-started` and confirm content renders. Stop server.

**Step 3: Commit**

```bash
git add docs/getting-started.md
git commit -m "feat(docs): add getting started page"
```

---

### Task 6: Create Architecture page

**Files:**
- Create: `docs/architecture.md`

**Step 1: Write Architecture content**

Create `docs/architecture.md`:

```markdown
# Architecture

Talkative Lobster is an Electron app with a React renderer. The main process handles voice processing, and the renderer displays the UI.

## Process Overview

```
┌─────────────────────────────────────────────────┐
│ Main Process                                    │
│                                                 │
│  orchestrator.ts ── coordinates all engines      │
│       │                                         │
│       ├── voice-machine.ts (xstate)             │
│       │     idle → listening → processing       │
│       │     → thinking → speaking               │
│       │                                         │
│       ├── stt-engine.ts                         │
│       │     ElevenLabs / Whisper / whisper.cpp   │
│       │                                         │
│       ├── tts/ (provider implementations)       │
│       │     ElevenLabs / VOICEVOX / Kokoro      │
│       │     / Piper                             │
│       │                                         │
│       └── openclaw-client.ts                    │
│             WebSocket → OpenClaw gateway         │
│                                                 │
└────────────── IPC (contextBridge) ──────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│ Renderer Process (React 19)                     │
│                                                 │
│  App.tsx                                        │
│    ├── VoiceView ── main conversation UI        │
│    │     └── Waveform ── audio visualization    │
│    └── SetupModal ── first-run configuration    │
│                                                 │
│  hooks/                                         │
│    ├── useVoiceState ── voice machine state      │
│    ├── useTtsPlayback ── audio playback          │
│    └── useKeys ── encrypted key management      │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Data Flow

1. **Renderer** captures microphone audio via `@ricky0123/vad-web` (Silero VAD)
2. **VAD** detects speech start/end and sends audio chunks to main process via IPC
3. **STT engine** converts audio to text using the configured provider
4. **Orchestrator** sends transcribed text to OpenClaw gateway via WebSocket
5. **OpenClaw** streams LLM response tokens back
6. **Speech filter** processes the response text for TTS
7. **TTS engine** synthesizes audio from the filtered text
8. **Renderer** plays synthesized audio via `useTtsPlayback`

## Voice State Machine

The voice state machine (`voice-machine.ts`) is built with [xstate](https://xstate.js.org/) v5 and manages the conversation lifecycle:

| State | Description |
|-------|-------------|
| `idle` | Waiting for user to speak |
| `listening` | VAD detected speech, recording audio |
| `processing` | STT converting speech to text |
| `thinking` | Waiting for LLM response from OpenClaw |
| `speaking` | TTS playing the AI response |

Transitions happen automatically. The user can interrupt during `speaking` by starting to talk, which transitions back to `listening`.

## Key Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| Orchestrator | `src/main/orchestrator.ts` | Central IPC + engine coordination |
| Voice Machine | `src/main/voice-machine.ts` | xstate state machine for conversation flow |
| OpenClaw Client | `src/main/openclaw-client.ts` | WebSocket client for LLM gateway |
| STT Engine | `src/main/stt-engine.ts` | Multi-provider speech-to-text |
| Speech Filter | `src/main/speech-filter.ts` | Text processing before TTS |
| Settings Store | `src/main/settings-store.ts` | Encrypted settings persistence |
| Piper TTS | `src/main/tts/piper-tts.ts` | Local TTS via Piper |
| VOICEVOX TTS | `src/main/tts/voicevox-tts.ts` | Japanese TTS via VOICEVOX |

## Directory Structure

```
src/
  main/              # Electron main process
    orchestrator.ts   #   Central IPC + engine coordination
    voice-machine.ts  #   xstate state machine
    openclaw-client.ts#   WebSocket client for OpenClaw gateway
    stt-engine.ts     #   Multi-provider speech-to-text
    speech-filter.ts  #   Text processing before TTS
    settings-store.ts #   Encrypted settings persistence
    tts/              #   TTS provider implementations
    __tests__/        #   Unit tests
  preload/            # contextBridge (window.lobster API)
  renderer/           # React 19 UI
    hooks/            #   useVoiceState, useTtsPlayback, etc.
    components/       #   VoiceView, SetupModal, Waveform
  shared/             # Types and IPC channel definitions
```
```

**Step 2: Verify the page renders**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/architecture` and confirm the diagrams and tables render. Stop server.

**Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "feat(docs): add architecture page"
```

---

### Task 7: Create Providers page

**Files:**
- Create: `docs/providers.md`

**Step 1: Write Providers content**

Create `docs/providers.md`:

```markdown
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
```

**Step 2: Verify the page renders**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/providers` and confirm all sections render. Stop server.

**Step 3: Commit**

```bash
git add docs/providers.md
git commit -m "feat(docs): add providers page"
```

---

### Task 8: Create Configuration page

**Files:**
- Create: `docs/configuration.md`

**Step 1: Write Configuration content**

Create `docs/configuration.md`:

```markdown
# Configuration

All configuration is done through the Settings modal in the app. Settings are persisted locally using Electron's `safeStorage` for sensitive values like API keys.

## Settings Modal

Open the Settings modal by clicking the gear icon. It has three sections:

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
```

**Step 2: Verify the page renders**

Run: `pnpm docs:dev` — navigate to `http://localhost:5173/talkative-lobster/configuration` and confirm all sections render. Stop server.

**Step 3: Commit**

```bash
git add docs/configuration.md
git commit -m "feat(docs): add configuration page"
```

---

### Task 9: Add .vitepress/dist to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add VitePress build output to .gitignore**

Append the following to `.gitignore`:

```
# VitePress
docs/.vitepress/dist
docs/.vitepress/cache
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore vitepress build output"
```

---

### Task 10: Final verification

**Step 1: Build the docs site**

Run: `pnpm docs:build`
Expected: Build succeeds with no errors.

**Step 2: Preview the built site**

Run: `pnpm docs:preview`
Navigate to `http://localhost:4173/talkative-lobster/` and verify:
- Home page hero with logo
- All 5 pages accessible via nav/sidebar
- Brand colors (red/pink) applied correctly
- Logo appears in nav and as favicon
- Local search works
- All internal links work

**Step 3: Stop preview server**
