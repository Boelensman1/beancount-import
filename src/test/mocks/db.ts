import { vi } from 'vitest'
import type { Low } from 'lowdb'
import type { Database } from '@/lib/db/types'
import { defaultData } from '@/lib/db/defaultData'

/**
 * Creates an in-memory mock database instance
 * Each call returns a fresh instance with isolated state
 *
 * @param initialData - Optional initial database state
 * @returns Mock database instance that mimics Low<Database> API
 */
export function createMockDb(initialData?: Partial<Database>): Low<Database> {
  // Merge initial data with defaults
  const data: Database = JSON.parse(
    JSON.stringify({
      config: {
        accounts: initialData?.config?.accounts ?? defaultData.config.accounts,
      },
      imports: initialData?.imports ?? defaultData.imports,
      batches: initialData?.batches ?? defaultData.batches,
    }),
  )

  // Create a mock that behaves like Low<Database>
  const mockDb = {
    data,
    read: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  } as unknown as Low<Database>

  return mockDb
}

/**
 * Helper to setup db mock in tests
 * Call this in beforeEach to ensure fresh mock state
 *
 * @example
 * ```ts
 * import { setupDbMock } from '@/test/mocks/db';
 *
 * beforeEach(() => {
 *   setupDbMock();
 * });
 *
 * it('should work', async () => {
 *   const mockDb = createMockDb({
 *     config: { accounts: [{ name: 'test', importerCommand: 'echo test' }] }
 *   });
 *   vi.mocked(getDb).mockResolvedValue(mockDb);
 *   // ... rest of test
 * });
 * ```
 */
export function setupDbMock() {
  // Clear all mocks between tests
  vi.clearAllMocks()
}
