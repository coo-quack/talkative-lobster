# Project Guidelines

## Stack

- **React 19.x** / **TypeScript 5.9** / **Electron** (electron-vite)
- **Tailwind CSS 4** / **XState 5** / **Vitest** / **Playwright**

## React Compiler

This project uses **React Compiler** (`babel-plugin-react-compiler`) to automatically optimize re-renders.

### Rules

- Do NOT use `useCallback`, `useMemo`, or `React.memo` for performance optimization — the compiler handles memoization automatically.
- `useRef` should only be used for imperative handles (DOM refs, AudioContext, timers, external library instances). Do NOT use refs as a workaround for stale closures in manually memoized callbacks.
- `useEffect` dependency arrays should express semantic intent (when should this effect re-run?), not be tuned for referential identity.
- Exception: when a third-party library stores callbacks at initialization time (e.g., `MicVAD.new`), the "ref for latest callback" pattern is still necessary. Mark these with a comment explaining why.
