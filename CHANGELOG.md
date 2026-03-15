# Changelog

## v1.2.2 (2026-03-15)

### Docs

- Update README badge to show Release workflow status
- Add MIT license (LICENSE file, README, package.json)

### CI

- Upgrade GitHub Actions to Node.js 24-compatible versions (checkout v6, setup-node v6, upload/download-artifact v7/v8, upload-pages-artifact v4)
- Update CI node-version from 20 to 22 (LTS)

### Chores

- Update biome.json schema version to match installed version (2.4.7)
- Add .vscode, *.tsbuildinfo, and .pnpm-store to .gitignore
- Enable Renovate dependency dashboard

---

## v1.2.1 (2026-03-15)

### Security

- Fix vulnerable transitive dependencies (undici, yauzl) via pnpm overrides

### Chores

- Update production dependencies (react 19.2.4, elevenlabs-js 2.39.0, xstate/react 6.1.0, lucide-react 0.577.0, onnxruntime-web 1.24.3)
- Update dev dependencies (electron 41.0.2, jsdom 29.0.0, vitest 4.1.0, biome 2.4.7, electron-builder 26.8.1)

---

## v1.2.0 (2026-03-15)

### Features

- Adopt React Compiler (`babel-plugin-react-compiler`) for automatic memoization
- Add HiDPI (devicePixelRatio) support to Waveform canvas
- Add CLAUDE.md with project guidelines and React Compiler rules

### Fixes

- Fix VAD not re-creating MicVAD when thresholds change
- Fix stale cleanup→startVAD chain leaving mic active after disable/unmount
- Fix gateway auto-reconnect after intentional disconnect (disposed flag)
- Fix unhandled promise rejections in audio hook effect cleanups
- Fix partial initialization leak in speaker monitor on capture failure
- Fix settings loading blocking UI on single IPC failure (Promise.allSettled)
- Fix temp directory cleanup masking successful TTS/STT results
- Always reconnect gateway on SESSION_START (URL/token may have changed)

### Refactors

- Remove manual `useCallback`/`useMemo`/ref-for-latest-value patterns (React Compiler)
- Unify VoiceEvent type in voice-machine.ts (single source of truth)
- Derive ACCEPTED_EVENTS from XState machine config automatically
- Cache ElevenLabsClient in SttEngine constructor
- Reduce TtsSettings prop drilling via Pick-based settings object
- Convert sync I/O to async in PiperTts and SttEngine
- Consolidate hardcoded color values into CSS custom properties
- Type STATUS_LABELS and STATE_DOT_COLORS with VoiceState for exhaustiveness
- Hoist VALID_KEY_SOURCES to module-level typed constant
- Delete unused tts-engine.ts re-export file

### Docs

- Unify documentation site structure
- Add changelog page to VitePress documentation
- Add install page with OS-specific instructions
- Symlink contributing.md to root CONTRIBUTING.md

### CI

- Simplify backport workflow to direct main-to-develop merge

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
