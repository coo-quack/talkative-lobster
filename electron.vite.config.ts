import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { readFileSync, cpSync, mkdirSync } from 'fs'

/**
 * Serves VAD and ONNX Runtime assets from node_modules during dev,
 * and copies them into the build output for production.
 */
function serveNativeAssets(): Plugin {
  const assetSources: Record<string, string> = {}

  // Map URL paths to node_modules file paths
  const vadDist = resolve('node_modules/@ricky0123/vad-web/dist')
  const onnxDist = resolve('node_modules/onnxruntime-web/dist')

  const vadFiles = [
    'silero_vad_legacy.onnx',
    'silero_vad_v5.onnx',
    'vad.worklet.bundle.min.js',
  ]
  const onnxPattern = /^ort-wasm.*\.(mjs|wasm)$/

  for (const f of vadFiles) {
    assetSources[`/${f}`] = resolve(vadDist, f)
  }

  const mimeTypes: Record<string, string> = {
    '.onnx': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.mjs': 'application/javascript',
    '.js': 'application/javascript',
  }

  return {
    name: 'serve-native-assets',

    // Dev: intercept requests and serve from node_modules
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]

        // Check VAD assets (exact match)
        const vadPath = assetSources[url]
        if (vadPath) {
          try {
            const content = readFileSync(vadPath)
            const ext = url.substring(url.lastIndexOf('.'))
            res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(content)
            return
          } catch { /* fall through */ }
        }

        // Check ONNX Runtime files (pattern match)
        const filename = url.split('/').pop() ?? ''
        if (onnxPattern.test(filename)) {
          try {
            const content = readFileSync(resolve(onnxDist, filename))
            const ext = filename.substring(filename.lastIndexOf('.'))
            res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(content)
            return
          } catch { /* fall through */ }
        }

        next()
      })
    },

    // Build: copy assets to renderer output directory
    writeBundle(options) {
      const outDir = options.dir ?? resolve('out/renderer')
      mkdirSync(outDir, { recursive: true })

      // Copy VAD files
      for (const f of vadFiles) {
        cpSync(resolve(vadDist, f), resolve(outDir, f))
      }

      // Copy ONNX WASM files
      const onnxFiles = [
        'ort-wasm-simd-threaded.wasm',
        'ort-wasm-simd-threaded.jsep.wasm',
        'ort-wasm-simd-threaded.mjs',
      ]
      for (const f of onnxFiles) {
        try {
          cpSync(resolve(onnxDist, f), resolve(outDir, f))
        } catch { /* optional files */ }
      }
    },
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), serveNativeAssets()]
  }
})
