import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock the database module globally
vi.mock('@/lib/db/db', () => ({
  getDb: vi.fn(),
  resetDb: vi.fn(),
  setDbFilePath: vi.fn(),
}))
