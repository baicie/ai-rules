import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = fileURLToPath(import.meta.url)
const packagesRoot = resolve(here, '..', '..')

export default defineConfig({
  resolve: {
    alias: {
      '@baicie/airules-schema': resolve(packagesRoot, 'schema/src/index.ts'),
      '@baicie/airules-core': resolve(packagesRoot, 'core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
