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
│       │     ElevenLabs / VOICEVOX               │
│       │     / Kokoro / Piper                    │
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
| Keys | `src/main/keys.ts` | API key encryption (AES-256-CBC) |
| Settings Store | `src/main/settings-store.ts` | Settings persistence (JSON) |
| ElevenLabs TTS | `src/main/tts/elevenlabs-tts.ts` | Cloud TTS via ElevenLabs |
| VOICEVOX TTS | `src/main/tts/voicevox-tts.ts` | Japanese TTS via VOICEVOX |
| Kokoro TTS | `src/main/tts/kokoro-tts.ts` | Local TTS via Kokoro |
| Piper TTS | `src/main/tts/piper-tts.ts` | Local TTS via Piper |

## Directory Structure

```
src/
  main/              # Electron main process
    orchestrator.ts   #   Central IPC + engine coordination
    voice-machine.ts  #   xstate state machine
    openclaw-client.ts#   WebSocket client for OpenClaw gateway
    stt-engine.ts     #   Multi-provider speech-to-text
    speech-filter.ts  #   Text processing before TTS
    keys.ts           #   API key encryption (AES-256-CBC)
    settings-store.ts #   Settings persistence (JSON)
    tts/              #   TTS provider implementations
    __tests__/        #   Unit tests
  preload/            # contextBridge (window.lobster API)
  renderer/           # React 19 UI
    hooks/            #   useVoiceState, useTtsPlayback, etc.
    components/       #   VoiceView, SetupModal, Waveform
  shared/             # Types and IPC channel definitions
```
