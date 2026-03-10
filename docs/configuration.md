# Configuration

All configuration is done through the Settings modal in the app.

## Settings Modal

The Settings modal opens automatically on first launch. Reopen it anytime by clicking the gear icon in the main screen.

### Gateway Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Gateway URL | WebSocket URL for the OpenClaw gateway | `ws://127.0.0.1:18789` |
| `GATEWAY_TOKEN` | Authentication token for the gateway | — |

The gateway connects to an [OpenClaw](https://github.com/coo-quack/openclaw) instance that routes requests to your configured LLM.

### STT Settings

| Setting | Description | Default |
|---------|-------------|---------|
| STT Provider | Speech-to-text engine | `ElevenLabs Scribe` |
| `ELEVENLABS_API_KEY` | API key (ElevenLabs) | — |
| `OPENAI_API_KEY` | API key (OpenAI Whisper) | — |
| whisper.cpp Binary Path | Path to `whisper-cli` binary | — |

See [Providers](/providers#speech-to-text-stt) for details on each provider.

### TTS Settings

| Setting | Description | Default |
|---------|-------------|---------|
| TTS Provider | Text-to-speech engine | `ElevenLabs` |
| TTS Voice ID | ElevenLabs voice | `pFZP5JQG7iQjIQuC4Bku` (Lily) |
| TTS Model | ElevenLabs model | `eleven_multilingual_v2` |
| VOICEVOX URL | VOICEVOX server URL | `http://localhost:50021` |
| VOICEVOX Speaker ID | VOICEVOX speaker | `1` |
| Kokoro URL | Kokoro server URL | `http://localhost:8880` |
| Kokoro Voice | Kokoro voice ID | `jf_alpha` |
| Piper Binary Path | Path to piper binary | — |
| Piper Model Path | Path to `.onnx` model | — |

See [Providers](/providers#text-to-speech-tts) for details on each provider.

### VAD Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Sensitivity | `auto` or manual value (0.001–0.05) | `auto` |

See [Voice Activity Detection](#voice-activity-detection) below.

### Connectivity Checks

Each section has a **Test** button that validates the connection:

- **Gateway**: HTTP GET to the gateway URL (requires `GATEWAY_TOKEN`)
- **STT**: Provider-specific check (API key validation or binary existence)
- **TTS**: Provider-specific check (API key validation, server connectivity, or binary existence)

All three checks must pass before the **Start** button is enabled.

---

## API Key Management

### Storage

API keys are encrypted with AES-256-CBC and stored locally:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/TalkLob/keys.json` |
| Windows | `%APPDATA%/TalkLob/keys.json` |
| Linux | `~/.config/TalkLob/keys.json` |

Keys never leave your machine unencrypted.

### Key Sources

Each key can be loaded from three sources (shown as buttons in the Settings modal):

| Source | Description |
|--------|-------------|
| **Manual** | Type the key directly into the input field |
| **OpenClaw** | Auto-load from `~/.openclaw/openclaw.json` |
| **Env** | Read from environment variables |

#### OpenClaw Config Format

```json
{
  "gateway": {
    "auth": { "token": "your-gateway-token" }
  },
  "env": {
    "ELEVENLABS_API_KEY": "your-elevenlabs-key",
    "OPENAI_API_KEY": "your-openai-key"
  }
}
```

#### Environment Variables

| Variable | Used For |
|----------|----------|
| `GATEWAY_TOKEN` | OpenClaw gateway authentication |
| `ELEVENLABS_API_KEY` | ElevenLabs STT and TTS |
| `OPENAI_API_KEY` | OpenAI Whisper STT |

---

## Voice Activity Detection

TalkLob uses [Silero VAD](https://github.com/snakers4/silero-vad) (neural network-based) to detect when you start and stop speaking. No push-to-talk button needed.

### Auto Calibration (Default)

When you enable the microphone, the app runs a 1.5-second calibration:

1. Captures ambient noise via the microphone (with WebRTC echo cancellation enabled)
2. Measures the median RMS (root mean square) noise level
3. Maps the noise floor to a VAD threshold:
   - **Quiet room** (low RMS) → lower threshold → more sensitive
   - **Noisy environment** (high RMS) → higher threshold → less sensitive

During calibration, the status shows **"Calibrating..."**.

### Manual Sensitivity

If auto calibration doesn't work well for your environment, switch to manual mode in **VAD Settings** and adjust the slider. Lower values = more sensitive (picks up quieter speech), higher values = less sensitive (ignores more background noise).

---

## Speaker Monitor

The speaker monitor captures system audio output to detect when media (YouTube, music, etc.) is playing. When system audio is detected, VAD is temporarily suppressed to prevent the AI from responding to non-speech sounds.

- Uses Electron's `desktopCapturer` API
- 800ms debounce to avoid rapid toggling
- Fails gracefully if system audio capture is not available

---

## Aizuchi (Backchanneling)

During the **Thinking** state (while waiting for the LLM response), TalkLob plays subtle audio cues to fill the silence and signal that the AI is processing. This mimics the Japanese conversational habit of "aizuchi" (相槌).

- Initial delay: 1.5–2.5 seconds
- Interval: 3–5 seconds between cues
- Automatically stops when the AI starts speaking

---

## Settings File

Settings are stored as JSON at `~/.config/lobster/settings.json`. While you can edit this file directly, using the Settings modal is recommended.

```json
{
  "sttProvider": "elevenlabs",
  "ttsProvider": "elevenlabs",
  "ttsVoiceId": "pFZP5JQG7iQjIQuC4Bku",
  "ttsModelId": "eleven_multilingual_v2",
  "voicevoxUrl": "http://localhost:50021",
  "voicevoxSpeakerId": 1,
  "kokoroUrl": "http://localhost:8880",
  "kokoroVoice": "jf_alpha",
  "vadSensitivity": "auto"
}
```
