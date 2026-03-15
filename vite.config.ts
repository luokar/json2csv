import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const githubPagesBase = '/json2csv/'

export default defineConfig(({ command }) => ({
  base:
    command === 'build'
      ? (process.env.PAGES_BASE_PATH ?? githubPagesBase)
      : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}))
