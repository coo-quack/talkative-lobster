import { setup } from 'xstate'

export const voiceMachine = setup({
  types: {
    events: {} as
      | { type: 'SPEECH_START' }
      | { type: 'SPEECH_END' }
      | { type: 'STT_DONE'; text: string }
      | { type: 'STT_FAIL' }
      | { type: 'LLM_STREAM_START' }
      | { type: 'TTS_DONE' }
      | { type: 'INTERRUPT' }
      | { type: 'CANCEL' },
  },
}).createMachine({
  id: 'voice',
  initial: 'idle',
  states: {
    idle: {
      on: { SPEECH_START: 'listening' },
    },
    listening: {
      on: {
        SPEECH_END: 'processing',
        CANCEL: 'idle',
      },
    },
    processing: {
      on: {
        STT_DONE: 'thinking',
        STT_FAIL: 'idle',
      },
    },
    thinking: {
      on: {
        LLM_STREAM_START: 'speaking',
      },
    },
    speaking: {
      on: {
        TTS_DONE: 'idle',
        INTERRUPT: 'idle',
      },
    },
  },
})
