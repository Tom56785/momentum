import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // A fixed zone with daylight saving, so clock-change tests behave the same everywhere.
    env: { TZ: 'Europe/London' },
  },
})
