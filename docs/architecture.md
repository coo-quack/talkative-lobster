# Architecture

Talkative Lobster is an Electron desktop app. The main process handles voice processing and gateway communication, while the renderer process displays the UI and captures microphone input.

## Process Overview

```
┌─────────────────────────────────────────────────┐
│ Main Process                                    │
│                                                 │
│  Orchestrator ── coordinates all engines         │
│       │                                         │
│       ├── Voice State Machine                   │
│       │     idle → listening → processing       │
│       │     → thinking → speaking               │
│       │                                         │
│       ├── STT (Speech-to-Text)                  │
│       │     ElevenLabs / Whisper / whisper.cpp   │
│       │                                         │
│       ├── TTS (Text-to-Speech)                  │
│       │     ElevenLabs / VOICEVOX               │
│       │     / Kokoro / Piper                    │
│       │                                         │
│       └── Gateway Client                        │
│             WebSocket → OpenClaw LLM gateway     │
│                                                 │
└────────────── IPC (contextBridge) ──────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│ Renderer Process                                │
│                                                 │
│  Voice View ── main conversation UI             │
│    └── Waveform ── audio visualization          │
│  Setup Modal ── settings & connectivity checks  │
│                                                 │
│  VAD (Voice Activity Detection)                 │
│    └── Silero neural network model              │
│  Speaker Monitor ── filters out system audio    │
│  Audio Playback ── TTS + aizuchi audio          │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Data Flow

1. **Microphone** → VAD detects speech start/end
2. **Audio chunks** → sent to main process via IPC
3. **STT** → converts audio to text
4. **Orchestrator** → sends text to OpenClaw gateway via WebSocket
5. **LLM** → streams response tokens back
6. **TTS** → synthesizes audio from response text
7. **Renderer** → plays audio through speakers

## Voice State Machine

The conversation lifecycle is managed by a state machine:

| State | Description |
|-------|-------------|
| `idle` | Waiting for user to speak |
| `listening` | Speech detected, recording audio |
| `processing` | Converting speech to text |
| `thinking` | Waiting for LLM response |
| `speaking` | Playing AI response audio |

Transitions happen automatically. The user can interrupt during `speaking` by starting to talk, which transitions back to `listening`.
