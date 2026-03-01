# Codebase Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix bugs, improve type safety, add error handling, and expand test coverage across the entire codebase.

**Architecture:** Address 14 improvements in priority order — bugs first, then type safety, error handling, performance, and finally test coverage. Each task is self-contained with TDD where applicable.

**Tech Stack:** TypeScript, xstate 5, Vitest, MSW, Playwright, Electron IPC

---

### Task 1: Fix `thinking` state deadlock in voice machine

The `thinking` state has no way to escape if the user speaks or cancels before LLM responds. Add `SPEECH_START` and `CANCEL` transitions.

**Files:**
- Modify: `src/main/voice-machine.ts:37-41`
- Modify: `src/main/__tests__/voice-machine.test.ts`

**Step 1: Write failing tests**

Add to `src/main/__tests__/voice-machine.test.ts`:

```typescript
it('thinking → listening on SPEECH_START (user interruption)', () => {
  expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'SPEECH_START'])).toBe('listening')
})

it('thinking → idle on CANCEL', () => {
  expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'CANCEL'])).toBe('idle')
})

it('ignores SPEECH_START in processing', () => {
  expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'SPEECH_START'])).toBe('processing')
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/voice-machine.test.ts`
Expected: 2 failures (thinking tests), 1 pass (processing ignores SPEECH_START — xstate drops unknown events)

**Step 3: Add transitions to thinking state**

In `src/main/voice-machine.ts`, change:

```typescript
thinking: {
  on: {
    LLM_STREAM_START: 'speaking',
  },
},
```

to:

```typescript
thinking: {
  on: {
    LLM_STREAM_START: 'speaking',
    SPEECH_START: 'listening',
    CANCEL: 'idle',
  },
},
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/voice-machine.test.ts`
Expected: All 12 tests pass

**Step 5: Commit**

```
feat: allow user interruption and cancel during thinking state
```

---

### Task 2: Fix pending Map memory leak in OpenClawClient

When WebSocket disconnects, pending requests stay forever. Reject all pending on `close`.

**Files:**
- Modify: `src/main/openclaw-client.ts:132-136` (close handler)
- Modify: `src/main/openclaw-client.ts:146-150` (disconnect method)
- Modify: `src/main/__tests__/openclaw-client.test.ts`

**Step 1: Write failing test**

Add to `src/main/__tests__/openclaw-client.test.ts`:

```typescript
it('rejects pending requests on disconnect', async () => {
  const client = new OpenClawClient('ws://localhost:9999', 'token', 'session')
  await resolveConnect(client)

  // Send a request that will pend
  const requestPromise = (client as any).request('test.method', { data: 'hello' })

  // Disconnect while request is pending
  client.disconnect()

  await expect(requestPromise).rejects.toThrow('disconnected')
})
```

This test needs to use the existing MockWebSocket from the test file. Check current mock setup and integrate accordingly.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/openclaw-client.test.ts`
Expected: FAIL — promise never resolves/rejects (timeout)

**Step 3: Add pending rejection on close/disconnect**

In `src/main/openclaw-client.ts`, add a private method:

```typescript
private rejectAllPending(): void {
  for (const [id, { reject }] of this.pending) {
    reject(new Error('disconnected'))
  }
  this.pending.clear()
}
```

Call `this.rejectAllPending()` in:
- The `close` event handler (line ~133)
- The `disconnect()` method (line ~147)

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/openclaw-client.test.ts`
Expected: All 7 tests pass

**Step 5: Commit**

```
fix: reject pending requests on WebSocket disconnect
```

---

### Task 3: Emit error event for LLM chat errors

When `chat.state === 'error'`, emit an `'error'` event so the orchestrator can notify the user.

**Files:**
- Modify: `src/main/openclaw-client.ts:210-213`
- Modify: `src/main/__tests__/openclaw-client.test.ts`

**Step 1: Write failing test**

Add to `src/main/__tests__/openclaw-client.test.ts`:

```typescript
it('emits chatError event on chat error state', async () => {
  const client = new OpenClawClient('ws://localhost:9999', 'token', 'session')
  await resolveConnect(client)

  const errors: string[] = []
  client.on('chatError', (msg: string) => errors.push(msg))

  // Trigger a chat.send to register the runId
  await resolveChatSend(client, 'hello', 'run-err')

  // Simulate chat error event
  const ws = (client as any).ws
  ws.emit('message', JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: { state: 'error', runId: 'run-err', errorMessage: 'Rate limit exceeded' },
  }))

  expect(errors).toEqual(['Rate limit exceeded'])
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/openclaw-client.test.ts`
Expected: FAIL — `errors` is empty

**Step 3: Add emit in chat error handler**

In `src/main/openclaw-client.ts`, change the error handler (~line 210-213):

```typescript
} else if (payload.state === 'error') {
  this.activeRunIds.delete(payload.runId)
  console.error('[openclaw] Chat error:', payload.errorMessage)
  this.emit('chatError', payload.errorMessage ?? 'Unknown LLM error')
}
```

**Step 4: Wire chatError in orchestrator**

In `src/main/orchestrator.ts`, after the `wsClient.on('done', ...)` block (~line 162), add:

```typescript
this.wsClient.on('chatError', (message: string) => {
  this.llmStreaming = false
  this.send(IPC.ERROR, `LLM error: ${message}`)
  this.actor.send({ type: 'STT_FAIL' })
})
```

Note: Sending `STT_FAIL` here resets the machine to `idle` from `thinking` (now that Task 1 added `CANCEL` to thinking — but `STT_FAIL` is only valid in `processing`). Instead, use `CANCEL`:

```typescript
this.wsClient.on('chatError', (message: string) => {
  this.llmStreaming = false
  this.send(IPC.ERROR, `LLM error: ${message}`)
  this.actor.send({ type: 'CANCEL' })
})
```

This works because after Task 1, `CANCEL` is valid in both `listening` and `thinking`.

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit**

```
fix: emit chatError event and notify user on LLM errors
```

---

### Task 4: Fix `as any` cast in stt-engine.ts

The ElevenLabs SDK `speechToText.convert()` returns an `HttpResponsePromise` that resolves with the typed response. Use proper types.

**Files:**
- Modify: `src/main/stt-engine.ts:65-73`

**Step 1: Fix the cast**

Change line 72:

```typescript
return (result as any).text
```

to:

```typescript
return result.text
```

The SDK types `SpeechToTextChunkResponseModel` include a `text: string` property. If TypeScript complains about the union type, use:

```typescript
if ('text' in result && typeof result.text === 'string') {
  return result.text
}
throw new Error('Unexpected STT response format')
```

**Step 2: Run tests**

Run: `npx vitest run src/main/__tests__/stt-engine.test.ts`
Expected: All pass

**Step 3: Commit**

```
refactor: remove as-any cast from ElevenLabs STT result
```

---

### Task 5: Fix `as any` cast in settings-store.ts

**Files:**
- Modify: `src/main/settings-store.ts:69-81`

**Step 1: Fix the load method**

Replace the load method body:

```typescript
private load(): void {
  if (!this.filePath || !existsSync(this.filePath)) return
  try {
    const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Record<string, unknown>
    for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      if (key in raw && typeof raw[key] === typeof DEFAULTS[key]) {
        // Use Object.assign for type-safe dynamic property assignment
        Object.assign(this.data, { [key]: raw[key] })
      }
    }
  } catch {
    /* ignore corrupt file */
  }
}
```

**Step 2: Run tests**

Run: `npx vitest run src/main/__tests__/settings-store.test.ts`
Expected: All pass

**Step 3: Commit**

```
refactor: remove as-any cast from settings store load
```

---

### Task 6: Fix duplicate VoiceState type definitions

Three files define `VoiceState` locally instead of importing from `shared/types.ts`.

**Files:**
- Modify: `src/renderer/src/hooks/useVoiceState.ts:1-3`
- Modify: `src/renderer/src/components/Waveform.tsx:1-3`
- Modify: `src/renderer/src/hooks/useKeys.ts:1-7`

**Step 1: Update useVoiceState.ts**

Replace:
```typescript
type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking'
```
with:
```typescript
import type { VoiceState } from '../../../shared/types'
```

**Step 2: Update Waveform.tsx**

Replace:
```typescript
type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking'
```
with:
```typescript
import type { VoiceState } from '../../../shared/types'
```

**Step 3: Update useKeys.ts**

Remove the local `KeyInfo` interface and import from shared:

```typescript
import { useState, useEffect } from 'react'
import type { KeyInfo } from '../../../shared/types'
```

**Step 4: Fix App.tsx any casts**

In `src/renderer/src/App.tsx`, change:

```typescript
window.budgie.getKeys().then((keys: any[]) => {
  const required = keys.filter((k: any) => k.name !== 'OPENAI_API_KEY')
  setNeedsSetup(!required.every((k: any) => k.isSet))
})
```

to:

```typescript
window.budgie.getKeys().then((keys: KeyInfo[]) => {
  const required = keys.filter((k) => k.name !== 'OPENAI_API_KEY')
  setNeedsSetup(!required.every((k) => k.isSet))
})
```

Add import: `import type { KeyInfo } from '../../shared/types'`

**Step 5: Run build to verify no type errors**

Run: `npx electron-vite build`
Expected: Build succeeds

**Step 6: Commit**

```
refactor: use shared type definitions instead of local duplicates
```

---

### Task 7: Add error handling to SetupModal and useKeys

**Files:**
- Modify: `src/renderer/src/hooks/useKeys.ts`
- Modify: `src/renderer/src/components/SetupModal.tsx`

**Step 1: Add catch to useKeys**

```typescript
useEffect(() => {
  window.budgie.getKeys()
    .then((k: KeyInfo[]) => {
      setKeys(k)
      setLoading(false)
    })
    .catch(() => {
      setLoading(false)
    })
}, [])
```

**Step 2: Add try-catch to SetupModal save**

Wrap the `save` function body in try-catch:

```typescript
const save = async () => {
  try {
    for (const [name, value] of Object.entries(inputs)) {
      if (value) await window.budgie.setKey(name, value)
    }
    // ... rest of saves
    await refresh()
    onComplete()
  } catch (err) {
    alert(`Failed to save settings: ${err instanceof Error ? err.message : err}`)
  }
}
```

**Step 3: Add catch to auto-load keys**

In the `readKeyFromOpenclaw` loop, add `.catch(() => {})`:

```typescript
window.budgie.readKeyFromOpenclaw(key.name).then((value) => {
  if (value) {
    setInputs((prev) => ({ ...prev, [key.name]: value }))
  }
}).catch(() => {})
```

**Step 4: Run E2E tests to verify no regressions**

Run: `npx electron-vite build && npx playwright test --config=e2e/playwright.config.ts`
Expected: All 26 pass

**Step 5: Commit**

```
fix: add error handling to SetupModal and useKeys
```

---

### Task 8: Fix useTtsPlayback stop() double-fire risk

`stop()` calls `ttsPlaybackDone()` but `source.onended` can also trigger `playNext()` which may call it again.

**Files:**
- Modify: `src/renderer/src/hooks/useTtsPlayback.ts:69-76`

**Step 1: Guard stop() to prevent double-fire**

```typescript
const stop = useCallback(() => {
  streamDoneRef.current = false
  queueRef.current = []
  const src = sourceRef.current
  sourceRef.current = null
  playingRef.current = false
  if (src) {
    src.onended = null   // detach before stop to prevent playNext
    src.stop()
  }
  window.budgie.ttsPlaybackDone()
}, [])
```

Key change: Set `sourceRef.current = null` and detach `onended` BEFORE calling `src.stop()`, so the ended event doesn't trigger `playNext()`.

**Step 2: Run build**

Run: `npx electron-vite build`
Expected: Build succeeds

**Step 3: Commit**

```
fix: prevent double ttsPlaybackDone on stop
```

---

### Task 9: Fix AUDIO_CHUNK inefficient Float32Array serialization

**Files:**
- Modify: `src/preload/index.ts` (sendAudioChunk)
- Modify: `src/main/orchestrator.ts:288-290` (AUDIO_CHUNK handler)

**Step 1: Update preload to send ArrayBuffer**

Find `sendAudioChunk` in `src/preload/index.ts`. Change from:

```typescript
sendAudioChunk: (audio: Float32Array) => ipcRenderer.send(IPC.AUDIO_CHUNK, Array.from(audio)),
```

to:

```typescript
sendAudioChunk: (audio: Float32Array) => ipcRenderer.send(IPC.AUDIO_CHUNK, audio.buffer),
```

**Step 2: Update orchestrator to receive ArrayBuffer**

In `src/main/orchestrator.ts`, change the handler:

```typescript
ipcMain.on(IPC.AUDIO_CHUNK, (_event, audio: ArrayBuffer) => {
  this.handleBatchStt(new Float32Array(audio))
})
```

**Step 3: Run unit tests**

Run: `npx vitest run`
Expected: All pass

**Step 4: Run E2E tests**

Run: `npx electron-vite build && npx playwright test --config=e2e/playwright.config.ts`
Expected: All pass

**Step 5: Commit**

```
perf: pass ArrayBuffer directly for audio chunks instead of number[]
```

---

### Task 10: Fix VOICEVOX Buffer.concat O(n^2) loop

**Files:**
- Modify: `src/main/tts/voicevox-tts.ts:47-61`
- Modify: `src/main/__tests__/voicevox-tts.test.ts` (verify existing tests still pass)

**Step 1: Replace concat loop with array accumulation**

Replace the streaming section:

```typescript
const reader = body.getReader()
const chunks: Buffer[] = []
while (true) {
  if (this.stopped) return
  const { done, value } = await reader.read()
  if (done) break
  chunks.push(Buffer.from(value))
}
if (this.stopped) return
const full = Buffer.concat(chunks)
for (let i = 0; i < full.length; i += CHUNK_SIZE) {
  yield full.subarray(i, Math.min(i + CHUNK_SIZE, full.length))
}
```

**Step 2: Run tests**

Run: `npx vitest run src/main/__tests__/voicevox-tts.test.ts`
Expected: All 16 pass

**Step 3: Commit**

```
perf: avoid O(n^2) Buffer.concat loop in VOICEVOX TTS
```

---

### Task 11: Fix stt-engine.ts dynamic imports

**Files:**
- Modify: `src/main/stt-engine.ts:91-96`

**Step 1: Replace dynamic imports with static**

Move the `import('node:fs')` etc. to the top of file. The file already has `import { execFileSync } from 'node:child_process'` at the top.

Add to the existing static imports at top:

```typescript
import { writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
```

Note: `homedir` is already imported from `node:os`. Merge them:

```typescript
import { homedir, tmpdir } from 'node:os'
```

Then remove the dynamic imports from `transcribeLocalWhisper` (lines 94-96 and 114).

**Step 2: Run tests**

Run: `npx vitest run src/main/__tests__/stt-engine.test.ts`
Expected: All pass

**Step 3: Commit**

```
refactor: use static imports in stt-engine local whisper
```

---

### Task 12: Remove unused _stopTts in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx:8`

**Step 1: Remove the unused destructure**

Change:
```typescript
const { stop: _stopTts } = useTtsPlayback()
```
to:
```typescript
useTtsPlayback()
```

The hook needs to be called (for side effects — it sets up TTS audio playback listeners), but the `stop` function is unused at the app level.

**Step 2: Run build**

Run: `npx electron-vite build`
Expected: Build succeeds

**Step 3: Commit**

```
refactor: remove unused _stopTts variable
```

---

### Task 13: Change MSW onUnhandledRequest to warn

**Files:**
- Modify: `src/main/__tests__/msw/setup.ts`

**Step 1: Change bypass to warn**

```typescript
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
```

**Step 2: Run tests to check for unintended real API calls**

Run: `npx vitest run`
Expected: All pass. If warnings appear about unhandled requests for localhost URLs (VOICEVOX/Kokoro tests use `vi.stubGlobal('fetch')`), that's fine — MSW only sees requests that reach native fetch.

If tests fail because `vi.stubGlobal('fetch')` conflicts with MSW, use `server.use(http.post(...))` overrides or keep `bypass` only for those specific tests. But since those tests mock `fetch` globally before MSW can intercept, there should be no conflict.

**Step 3: Commit**

```
chore: warn on unhandled MSW requests instead of bypass
```

---

### Task 14: Delete orphaned realtime-stt-engine.ts

This file is unreferenced from any production code and full of `as any` casts.

**Files:**
- Delete: `src/main/realtime-stt-engine.ts`

**Step 1: Verify it's unreferenced**

Run: `grep -r "realtime-stt-engine\|RealtimeSttEngine" src/ --include='*.ts' --include='*.tsx'`
Expected: Only hits in the file itself (or zero if the class name differs). Also check `ipc-channels.ts` for `AUDIO_CHUNK_REALTIME` and `STT_COMMIT` — if these are only used by realtime-stt-engine, note them as dead code but leave them for now (they're just string constants).

**Step 2: Delete the file**

```bash
rm src/main/realtime-stt-engine.ts
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 4: Commit**

```
chore: remove unused realtime-stt-engine
```

---

## Summary

| Task | Type | Risk |
|------|------|------|
| 1. thinking deadlock | Bug fix | Low — additive change |
| 2. pending Map leak | Bug fix | Low — cleanup on disconnect |
| 3. LLM error notification | Bug fix | Low — new event + handler |
| 4. STT as-any | Refactor | Minimal — type change only |
| 5. Settings as-any | Refactor | Minimal — Object.assign |
| 6. Duplicate types | Refactor | Low — imports only |
| 7. Error handling | Fix | Low — add catch blocks |
| 8. TTS double-fire | Bug fix | Low — guard before stop |
| 9. AudioChunk perf | Perf | Low — data format change |
| 10. VOICEVOX perf | Perf | Low — algorithm change |
| 11. Dynamic imports | Refactor | Minimal — move imports |
| 12. Unused variable | Cleanup | Minimal |
| 13. MSW warn | Config | Minimal |
| 14. Delete orphan | Cleanup | Minimal |
