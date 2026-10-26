import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { readmeHtml } from './scripts/readme-html.mjs'

export default defineConfig({
  // as scripts/build.mjs does
  define: { README_HTML: JSON.stringify(readmeHtml()) },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // acceptance tests launch a real Chromium per request, keep them sequential like the service sees them
    fileParallelism: false,
    testTimeout: 30000,
  },
})
