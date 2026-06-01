import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import mdx from '@mdx-js/rollup'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react(),
    mdx(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'service-worker.js',
      workbox: {
        // Increase the default 2,097,152 (2MiB) limit
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    // Pinned to 3000: the ZenMoney OAuth app (REACT_APP_REDIRECT_URI) is
    // registered with redirect_uri http://localhost:3000, so the dev server
    // MUST listen here or the auth callback breaks (ERR_CONNECTION_REFUSED).
    // strictPort: fail loudly if 3000 is taken instead of hopping to a port
    // that would also break the OAuth redirect.
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  envPrefix: 'REACT_APP_',
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  test: {
    globals: true,
    environment: 'happy-dom',
  },
})
