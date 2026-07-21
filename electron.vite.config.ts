import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
    resolve: { alias: { '@main': resolve('src/main') } },
  },
  preload: {
    build: { outDir: 'out/preload' },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { manager: resolve('src/renderer/manager/index.html') } },
    },
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve('src/renderer') } },
  },
})
