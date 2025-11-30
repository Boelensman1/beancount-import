import { vi } from 'vitest'
import type { Low } from 'lowdb'
import type { Database } from '@/lib/db/types'
import { defaultData } from '@/lib/db/defaultData'
import { DatabaseSchema } from '@/lib/db/schema'
import { serializeDatabase } from '@/lib/db/serialization'

/**
 * Creates an in-memory mock database instance
 * Each call returns a fresh instance with isolated state
 *
 * @param initialData - Optional initial database state
 * @returns Mock database instance that mimics Low<Database> API
 */
export function createMockDb(initialData?: Partial<Database>): Low<Database> {
  // Merge initial data with defaults
  const mergedData = {
    config: {
      defaults: initialData?.config?.defaults ?? defaultData.config.defaults,
      goCardless: initialData?.config?.goCardless,
      accounts: initialData?.config?.accounts ?? defaultData.config.accounts,
    },
    imports: initialData?.imports ?? defaultData.imports,
    batches: initialData?.batches ?? defaultData.batches,
  }

  // Serialize and parse to ensure Temporal objects are properly handled
  const serialized = serializeDatabase(mergedData as Database)
  const parsed = DatabaseSchema.parse(serialized)
  const data: Database = parsed

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
