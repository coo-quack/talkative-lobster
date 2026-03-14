# Getting Started

Get Talkative Lobster running on your machine in a few minutes.

## Prerequisites

### OpenClaw Gateway

Talkative Lobster uses [OpenClaw](https://github.com/coo-quack/openclaw) as its LLM gateway. You need to install and run it before using the app.

1. Install OpenClaw by following the instructions in the [OpenClaw repository](https://github.com/coo-quack/openclaw)
2. Configure at least one LLM provider (e.g., Anthropic, OpenAI, Ollama) in `~/.openclaw/openclaw.json`
3. Start the gateway — it runs on `ws://127.0.0.1:18789` by default
4. Note your gateway token from `~/.openclaw/openclaw.json` under `gateway.auth.token`

::: tip Auto-loading keys
If OpenClaw is installed, the app can auto-load your `GATEWAY_TOKEN` and API keys from `~/.openclaw/openclaw.json` — just click the **OpenClaw** button in the Settings modal.
:::

## Install

Download and install the app for your platform from the [Download](/download) page. For detailed OS-specific instructions, see the [Installation](/install) page.

## First Launch

On first launch, the **Settings modal** opens automatically and walks you through:

1. **OpenClaw Gateway** — enter your `GATEWAY_TOKEN` (default URL: `ws://127.0.0.1:18789`)
2. **STT Provider** — choose a speech-to-text provider and enter API keys if needed
3. **TTS Provider** — choose a text-to-speech provider and configure voice settings

Each section has a **Test** button to verify the connection. All three checks must pass before you can start.

See the [Providers](/providers) page for detailed setup instructions and available voices.

## Usage

### Conversation Flow

Once setup is complete, the main screen shows a waveform visualizer and a status indicator.

1. Click the **mic button** (or the green **ON** button) to enable your microphone
2. The app runs a brief noise calibration (~1.5 seconds) — status shows **"Calibrating..."**
3. Once ready, status changes to **"Listening..."** — start speaking naturally
4. When you stop talking, your speech is transcribed (status: **"Recognizing..."**)
5. The LLM processes your message (status: **"Thinking..."**)
6. The AI speaks back through your speakers (status: **"Speaking..."**)
7. After the response finishes, the app returns to **"Listening..."** and waits for you to speak again

### Interrupting the AI

You can interrupt the AI at any time while it is speaking — just start talking. The app will immediately stop the current TTS playback and begin processing your new input.

### Stopping

Click the **STOP** button to cancel the current operation. This works during any active state (recognizing, thinking, or speaking) and returns to the idle state.

### Settings

Click the **gear icon** in the bottom-right corner to reopen the Settings modal at any time. Changes take effect immediately — no restart required.

## Next Steps

- [Providers](/providers) — detailed STT and TTS provider configuration
- [Configuration](/configuration) — all settings explained
- [Troubleshooting](/troubleshooting) — common issues and solutions
- [Contributing](/contributing) — development setup for contributors
