import { setup } from 'xstate'

export const voiceMachine = setup({
  types: {
    events: {} as
      | { type: 'SPEECH_START' }
      | { type: 'SPEECH_END' }
      | { type: 'STT_DONE'; text: string }
      | { type: 'STT_FAIL' }
      | { type: 'TTS_PLAYING' }
      | { type: 'TTS_DONE' }
      | { type: 'CANCEL' }
  }
}).createMachine({
  id: 'voice',
  initial: 'idle',
  states: {
    idle: {
      on: { SPEECH_START: 'listening' }
    },
    listening: {
      after: {
        10000: 'idle'
      },
      on: {
        SPEECH_END: 'processing',
        CANCEL: 'idle'
      }
    },
    processing: {
      on: {
        STT_DONE: 'thinking',
        STT_FAIL: 'idle',
        SPEECH_START: 'listening',
        CANCEL: 'idle'
      }
    },
    thinking: {
      on: {
        TTS_PLAYING: 'speaking',
        TTS_DONE: 'idle',
        SPEECH_START: 'listening',
        CANCEL: 'idle'
      }
    },
    speaking: {
      on: {
        TTS_DONE: 'idle',
        SPEECH_START: 'listening',
        CANCEL: 'idle'
      }
    }
  }
})
