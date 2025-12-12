import type { Database } from './types'

/**
 * Default database structure
 */
export const defaultData: Database = {
  config: {
    defaults: {
      beangulpCommand: '',
    },
    accounts: [],
  },
  imports: [],
  batches: [],
  variables: {
    global: [],
  },
}
