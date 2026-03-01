# Documentation Site Design

## Overview

Create a VitePress documentation site for Talkative Lobster, following the same structure as sensitive-canary.

## Framework

VitePress — placed in `docs/` directory alongside existing `docs/plans/`.

## Brand Colors

Derived from logo SVG gradient (`#A2040B` → `#F94864`):

| Mode  | Brand 1   | Brand 2   | Brand 3   | Brand Soft                  |
|-------|-----------|-----------|-----------|-----------------------------|
| Light | `#8B0310` | `#A2040B` | `#D4243A` | `rgba(162, 4, 11, 0.12)`   |
| Dark  | `#F94864` | `#E83550` | `#D4243A` | `rgba(249, 72, 100, 0.16)` |

## Pages

| Page              | Path               | Content                                                                 |
|-------------------|--------------------|-------------------------------------------------------------------------|
| Home              | `/`                | Hero + 6 feature cards (VAD, STT, TTS, Interruption, Speaker Monitor, Encrypted Keys) |
| Getting Started   | `/getting-started` | Prerequisites, Install & Run, First Launch walkthrough                  |
| Architecture      | `/architecture`    | Process diagram, data flow, key module descriptions                     |
| Providers         | `/providers`       | STT/TTS provider list and configuration (ElevenLabs, Whisper, VOICEVOX, Kokoro, Piper) |
| Configuration     | `/configuration`   | Settings Modal items, API key management, OpenClaw connection           |

## Navigation

- **Nav**: Home, Getting Started, Providers, GitHub
- **Sidebar**: Guide (Getting Started), Reference (Architecture, Providers, Configuration)

## Deployment

- Base path: `/talkative-lobster/`
- Target: GitHub Pages

## Directory Structure

```
docs/
├── .vitepress/
│   ├── config.ts
│   └── theme/
│       ├── index.ts
│       └── style.css
├── public/
│   └── logo.svg
├── index.md
├── getting-started.md
├── architecture.md
├── providers.md
└── configuration.md
```

## npm Scripts

```json
"docs:dev": "vitepress dev docs",
"docs:build": "vitepress build docs",
"docs:preview": "vitepress preview docs"
```

## Language

All documentation content in English.
