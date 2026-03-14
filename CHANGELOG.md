# Changelog

## v1.1.1 (2026-03-14)

### Docs

- Add changelog page to VitePress documentation

---

## v1.1.0 (2026-03-14)

### Features

- Show app version and update notification in voice view
- Check for updates via GitHub Releases API with caching (1h success / 5min failure TTL)

### Fixes

- Support multi-model LLM response formats (nested content arrays, typed containers)
- Fix TTS interrupt — replace stopped boolean with generation counter pattern
- Strip `<thinking>` tags alongside `<think>` from LLM responses
- Recover from empty LLM final messages instead of getting stuck in thinking state
- Safe JSON.stringify for unserializable final messages

### Refactors

- Remove `isStopped` from TTS provider interface — generation counter is sufficient
- Hoist `SKIP_CONTENT_TYPES` to module-level constant in openclaw-client

---

## v1.0.5 (2026-03-12)

### Security

- Add explicit permissions to all workflow jobs
- Add SECURITY.md security policy

---

## v1.0.4 (2026-03-12)

### Security

- Fix vulnerable transitive dependencies (minimatch, tar, esbuild) via pnpm overrides

---

## v1.0.3 (2026-03-12)

### Fixes

- Scope CI badge to main branch

---

## v1.0.2 (2026-03-11)

### Chores

- Add Renovate configuration with automerge on CI success

---

## v1.0.1 (2026-03-10)

### Chores

- Add backport workflow to sync main changes to develop

---

## v1.0.0

- Initial release
- Voice-driven AI chat with real-time TTS playback
- VAD (Voice Activity Detection) with auto noise calibration
- Gateway WebSocket integration (OpenClaw protocol)
- Multi-platform support: macOS (arm64/x64), Windows (x64), Linux (AppImage/deb)
- Encrypted key storage with AES-256-CBC
- ElevenLabs and VOICEVOX TTS providers
