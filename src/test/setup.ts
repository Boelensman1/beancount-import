import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock the database module globally
vi.mock('@/lib/db/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/db')>()
  return {
    getDb: vi.fn(),
    resetDb: vi.fn(),
    setDbFilePath: vi.fn(),
    deserializeConfig: actual.deserializeConfig,
  }
})

// Mock the GoCardless module globally
vi.mock('@/lib/goCardless/goCardless', () => ({
  getGoCardless: vi.fn(),
  resetGoCardless: vi.fn(),
  resolveCallback: vi.fn(),
}))
