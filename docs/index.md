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
      text: Download
      link: /download
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
    details: API keys stored with obfuscated encryption on your machine. Keys never leave your device.
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
