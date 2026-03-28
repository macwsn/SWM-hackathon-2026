import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '')

  // Use environment variable or default to localhost:8000
  const API_URL = env.VITE_API_URL || 'http://localhost:8000'
  const WS_URL = env.VITE_WS_URL || 'ws://localhost:8000'

  return {
    plugins: [react(), basicSsl()],
    server: {
      port: 5173,
      host: true,
      https: true,
      proxy: {
        '/video': {
          target: API_URL,
          changeOrigin: true,
        },
        '/ws': {
          target: WS_URL,
          ws: true,
          changeOrigin: true,
        },
        '/health': {
          target: API_URL,
          changeOrigin: true,
        },
        '/api': {
          target: API_URL,
          changeOrigin: true,
        },
      },
    },
  }
})
