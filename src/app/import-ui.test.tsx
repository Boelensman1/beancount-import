import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportUI from './import-ui'
import type { AccountWithPendingStatus } from '@/lib/db/types'
import { renderWithQueryClient } from '@/test/test-utils'

// Test constants for account IDs (valid UUIDs)
const TEST_ACCOUNT_ID_1 = '00000000-0000-4000-8000-000000000001'
const TEST_ACCOUNT_ID_2 = '00000000-0000-4000-8000-000000000002'
const TEST_ACCOUNT_ID_3 = '00000000-0000-4000-8000-000000000003'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
}))

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

// Mock server actions
vi.mock('./_actions/imports', () => ({
  runImport: vi.fn(),
}))

vi.mock('./_actions/accounts', () => ({
  getAccountsWithPendingImports: vi.fn(),
}))

vi.mock('./_actions/batches', () => ({
  createBatch: vi.fn(),
  getBatches: vi.fn(),
}))

import { runImport as runImportAction } from './_actions/imports'
import { createBatch, getBatches } from './_actions/batches'
import { getAccountsWithPendingImports } from './_actions/accounts'

describe('ImportUI', () => {
  it('should render accounts with their names and commands', async () => {
    // Arrange: Create mock accounts
    const mockAccounts: AccountWithPendingStatus[] = [
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'Test Account 1',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/account1.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
      {
        id: TEST_ACCOUNT_ID_2,
        name: 'Test Account 2',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/account2.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
      {
        id: TEST_ACCOUNT_ID_3,
        name: 'Test Account 3',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/account3.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
    ]

    // Mock the server actions used by react-query hooks
    vi.mocked(getAccountsWithPendingImports).mockResolvedValue(mockAccounts)
    vi.mocked(getBatches).mockResolvedValue([])

    // Act: Render the component
    renderWithQueryClient(<ImportUI />)

    // Assert: Check that account names are rendered (wait for data to load)
    await waitFor(() => {
      expect(screen.getByText('Test Account 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Test Account 2')).toBeInTheDocument()
    expect(screen.getByText('Test Account 3')).toBeInTheDocument()
  })
})

describe('ImportUI - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show error status when import fails (no __IMPORT_ID__ marker)', async () => {
    const mockAccounts: AccountWithPendingStatus[] = [
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'Test Account',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/test.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
    ]

    vi.mocked(getAccountsWithPendingImports).mockResolvedValue(mockAccounts)
    vi.mocked(getBatches).mockResolvedValue([])
    vi.mocked(createBatch).mockResolvedValue('batch-id-1')

    const mockStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode('Starting import for account: Test Account\n'),
        )
        controller.enqueue(encoder.encode('Command: exit 1\n'))
        controller.enqueue(encoder.encode('\n'))
        controller.enqueue(
          encoder.encode('\nImport failed with exit code: 1\n'),
        )
        // NO __IMPORT_ID__ marker for failed import
        controller.close()
      },
    })
    vi.mocked(runImportAction).mockResolvedValue(mockStream)

    renderWithQueryClient(<ImportUI />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)

    const importButton = screen.getByText(/Import Selected/)
    await userEvent.click(importButton)

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    const errorIndicator = screen.getByText('Error').closest('span')
    expect(errorIndicator).toHaveClass('text-red-600')
  })

  it('should show completed status when import succeeds (has __IMPORT_ID__ marker)', async () => {
    const mockAccounts: AccountWithPendingStatus[] = [
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'Test Account',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/test.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
    ]

    vi.mocked(getAccountsWithPendingImports).mockResolvedValue(mockAccounts)
    vi.mocked(getBatches).mockResolvedValue([])
    vi.mocked(createBatch).mockResolvedValue('batch-id-1')

    const mockStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode('Starting import for account: Test Account\n'),
        )
        controller.enqueue(encoder.encode('Command: echo "test"\n'))
        controller.enqueue(encoder.encode('\n'))
        controller.enqueue(encoder.encode('test\n'))
        controller.enqueue(
          encoder.encode('\nImport completed successfully (exit code: 0)\n'),
        )
        controller.enqueue(encoder.encode('__IMPORT_ID__\n'))
        controller.enqueue(encoder.encode('test-uuid-123\n'))
        controller.close()
      },
    })
    vi.mocked(runImportAction).mockResolvedValue(mockStream)

    renderWithQueryClient(<ImportUI />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)

    const importButton = screen.getByText(/Import Selected/)
    await userEvent.click(importButton)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    const completedIndicator = screen.getByText('Completed').closest('span')
    expect(completedIndicator).toHaveClass('text-green-600')
  })
})
