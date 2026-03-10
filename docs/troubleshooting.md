# Troubleshooting

## macOS: "App is damaged" or blocked on first launch

The app is not signed with an Apple Developer ID. Go to **System Settings > Privacy & Security** and click **Open Anyway**.

## Microphone not working

- **macOS**: Go to **System Settings > Privacy & Security > Microphone** and allow TalkLob.
- **Windows**: Go to **Settings > Privacy > Microphone** and allow desktop apps.
- **Linux**: Ensure PulseAudio/PipeWire is running and the app has microphone permissions.

## Gateway connection fails

1. Verify [OpenClaw](https://github.com/coo-quack/openclaw) is running: `curl http://127.0.0.1:18789`
2. Check that `GATEWAY_TOKEN` is set correctly in Settings
3. Use the **Test** button in the Gateway section to verify

## STT returns no text

- **ElevenLabs / OpenAI**: Verify the API key is valid using the Test button
- **whisper.cpp**: Ensure the binary path is correct and the model exists at `~/.config/lobster/models/ggml-medium.bin`
- Check the microphone volume — speak at a normal level

## TTS produces no audio

- **ElevenLabs**: Verify the API key and check your ElevenLabs plan usage limits
- **VOICEVOX**: Ensure the VOICEVOX application is running at the configured URL
- **Kokoro**: Ensure the Kokoro server is running at the configured URL
- **Piper**: Verify both the binary path and model path are correct

## VAD not detecting speech

- Try switching from **Auto** to **Manual** sensitivity in VAD Settings
- For manual mode, lower the sensitivity value to make it more sensitive
- Ensure no other application is using the microphone exclusively

## AI responds to system audio (music, videos)

The speaker monitor should filter this out. If it doesn't:
- Ensure the app has screen recording permissions (macOS: **System Settings > Privacy & Security > Screen Recording**)
- The speaker monitor needs this permission to capture system audio levels

## App stuck in "Thinking..." state

The LLM is not responding or the gateway connection dropped. Click **STOP** to cancel and try again. Check the gateway connection status indicator in the header.
