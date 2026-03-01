import type { LobsterAPI } from './index'

declare global {
  interface Window {
    lobster: LobsterAPI
  }
}
