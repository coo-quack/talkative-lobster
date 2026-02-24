import type { BudgieAPI } from './index'

declare global {
  interface Window {
    budgie: BudgieAPI
  }
}
