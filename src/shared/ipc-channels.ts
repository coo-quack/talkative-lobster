export const IPC = {
  VOICE_STATE_CHANGED: 'voice:state-changed',
  VOICE_START: 'voice:start',
  VOICE_STOP: 'voice:stop',
  VOICE_INTERRUPT: 'voice:interrupt',
  AUDIO_CHUNK: 'audio:chunk',
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  TTS_AUDIO: 'tts:audio',
  TTS_STOP: 'tts:stop',           // Stream complete — let queued audio finish
  TTS_CANCEL: 'tts:cancel',       // Immediately stop playback
  TTS_PLAYBACK_STARTED: 'tts:playback-started',
  TTS_PLAYBACK_DONE: 'tts:playback-done',
  KEYS_GET: 'keys:get',
  KEYS_SET: 'keys:set',
  KEYS_READ_OPENCLAW: 'keys:read-openclaw',
  KEYS_READ_ENV: 'keys:read-env',
  TTS_VOICE_SET: 'tts:voice-set',
  TTS_VOICE_GET: 'tts:voice-get',
  TTS_MODEL_SET: 'tts:model-set',
  TTS_MODEL_GET: 'tts:model-get',
  CONNECTION_STATUS: 'connection:status',

  // STT provider settings
  STT_PROVIDER_GET: 'stt:provider-get',
  STT_PROVIDER_SET: 'stt:provider-set',
  LOCAL_WHISPER_PATH_GET: 'stt:local-whisper-path-get',
  LOCAL_WHISPER_PATH_SET: 'stt:local-whisper-path-set',

  // TTS provider settings
  TTS_PROVIDER_GET: 'tts:provider-get',
  TTS_PROVIDER_SET: 'tts:provider-set',
  VOICEVOX_URL_GET: 'tts:voicevox-url-get',
  VOICEVOX_URL_SET: 'tts:voicevox-url-set',
  KOKORO_URL_GET: 'tts:kokoro-url-get',
  KOKORO_URL_SET: 'tts:kokoro-url-set',
  KOKORO_VOICE_GET: 'tts:kokoro-voice-get',
  KOKORO_VOICE_SET: 'tts:kokoro-voice-set',
  PIPER_PATH_GET: 'tts:piper-path-get',
  PIPER_PATH_SET: 'tts:piper-path-set',
  PIPER_MODEL_PATH_GET: 'tts:piper-model-path-get',
  PIPER_MODEL_PATH_SET: 'tts:piper-model-path-set',
  VOICEVOX_SPEAKER_GET: 'tts:voicevox-speaker-get',
  VOICEVOX_SPEAKER_SET: 'tts:voicevox-speaker-set',
  // Connectivity checks
  TTS_CHECK: 'tts:check',
  STT_CHECK: 'stt:check',
  GATEWAY_CHECK: 'gateway:check',

  // Error notification
  ERROR: 'app:error',
} as const
