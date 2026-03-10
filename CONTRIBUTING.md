# Contributing

Thank you for your interest in contributing to Talkative Lobster!

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- An [OpenClaw](https://github.com/coo-quack/openclaw) gateway (for end-to-end testing with LLM)

### Getting Started

```bash
git clone https://github.com/coo-quack/talkative-lobster.git
cd talkative-lobster
pnpm install
pnpm dev
```

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production releases only. Protected — no direct push. |
| `develop` | Integration branch. PRs should target this branch. |
| `feature/*`, `fix/*`, `chore/*` | Feature/fix branches created from `develop`. |

### Workflow

1. Create a branch from `develop`
2. Make your changes
3. Run checks: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run test`
4. Push and open a PR targeting `develop`
5. At least one approval is required to merge

## Code Quality

### Checks

```bash
pnpm run typecheck     # TypeScript type checking
pnpm run lint          # Biome linter
pnpm run format:check  # Biome formatter
pnpm run test          # Vitest unit tests
pnpm run test:e2e      # Playwright E2E tests
```

### Auto-fix

```bash
pnpm run lint:fix      # Fix lint issues
pnpm biome format --write .  # Fix formatting
```

### Conventions

- **Formatter**: [Biome](https://biomejs.dev/) — run `pnpm biome format --write .` before committing
- **Linter**: Biome
- **Tests**: [Vitest](https://vitest.dev/) for unit tests, [Playwright](https://playwright.dev/) for E2E
- **Commit messages**: Use [Conventional Commits](https://www.conventionalcommits.org/) format (`feat:`, `fix:`, `chore:`, `docs:`, etc.)

## Project Structure

```
src/
  main/              # Electron main process
    orchestrator.ts   #   Central IPC + engine coordination
    voice-machine.ts  #   xstate v5 state machine
    openclaw-client.ts#   WebSocket client for OpenClaw gateway
    stt-engine.ts     #   Multi-provider speech-to-text
    tts/              #   TTS provider implementations
    keys.ts           #   API key encryption (AES-256-CBC)
    settings-store.ts #   Settings persistence (JSON)
  preload/            # contextBridge (window.lobster API)
  renderer/           # React 19 UI
    hooks/            #   useVoiceState, useTtsPlayback, useVAD, etc.
    components/       #   VoiceView, SetupModal, Waveform
  shared/             # Types and IPC channel definitions
e2e/                  # Playwright E2E tests
docs/                 # VitePress documentation site
```

## Release Process

Releases are automated via GitHub Actions:

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Merge to `main` via PR
4. The release workflow automatically:
   - Checks if the version tag already exists
   - Runs all checks (typecheck, lint, test)
   - Builds for macOS (arm64 + x64), Windows (x64), and Linux (AppImage + deb)
   - Creates a git tag and GitHub Release with artifacts

## Adding a New TTS Provider

1. Create `src/main/tts/your-provider-tts.ts` implementing `ITtsProvider` from `src/main/tts/tts-provider.ts`
2. Register it in `src/main/orchestrator.ts`
3. Add UI controls in `src/renderer/src/components/SetupModal.tsx`
4. Add a health check in `src/main/health-checks.ts`
5. Add the provider option to `src/main/settings-store.ts`
6. Write tests

## Adding a New STT Provider

1. Add the provider to `src/main/stt-engine.ts`
2. Add UI controls in `src/renderer/src/components/SetupModal.tsx`
3. Add a health check in `src/main/health-checks.ts`
4. Add the provider option to `src/main/settings-store.ts`
5. Write tests
