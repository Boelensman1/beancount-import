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
  getImports: vi.fn(),
}))

vi.mock('./_actions/accounts', () => ({
  getAccountsWithPendingImports: vi.fn(),
}))

import { runImport as runImportAction, getImports } from './_actions/imports'
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
    vi.mocked(getImports).mockResolvedValue([])

    // Act: Render the component
    renderWithQueryClient(<ImportUI />)

    // Assert: Check that account names are rendered (wait for data to load)
    await waitFor(() => {
      expect(screen.getByText('Test Account 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Test Account 2')).toBeInTheDocument()
    expect(screen.getByText('Test Account 3')).toBeInTheDocument()
  })

  it('should display existing pending imports with review links', async () => {
    const mockAccounts: AccountWithPendingStatus[] = [
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'Test Account',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/test.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: true,
      },
    ]

    const mockImports = [
      {
        id: 'existing-import-id',
        accountId: TEST_ACCOUNT_ID_1,
        timestamp: new Date().toISOString(),
        transactions: [],
        transactionCount: 5,
        csvPath: '/tmp/test.csv',
      },
    ]

    vi.mocked(getAccountsWithPendingImports).mockResolvedValue(mockAccounts)
    vi.mocked(getImports).mockResolvedValue(mockImports)

    renderWithQueryClient(<ImportUI />)

    // Wait for pending imports section to appear
    await waitFor(() => {
      expect(screen.getByText('Pending Imports')).toBeInTheDocument()
    })

    // Verify import details are shown
    expect(screen.getByText(/5 transactions/)).toBeInTheDocument()

    // Verify review link exists with correct href
    const reviewLink = screen.getByRole('link', { name: /Review/ })
    expect(reviewLink).toHaveAttribute(
      'href',
      '/review/import/existing-import-id',
    )
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
    vi.mocked(getImports).mockResolvedValue([])

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

    // Verify no review link is shown for failed imports
    const reviewLink = screen.queryByText('Review Import')
    expect(reviewLink).not.toBeInTheDocument()
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
    vi.mocked(getImports).mockResolvedValue([])

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

    // Wait for the review link to appear
    await waitFor(() => {
      expect(screen.getByText('Review Import')).toBeInTheDocument()
    })

    // Verify the link navigates to the correct import review page
    const reviewLink = screen.getByText('Review Import')
    expect(reviewLink.closest('a')).toHaveAttribute(
      'href',
      '/review/import/test-uuid-123',
    )
  })

  it('should run multiple imports in parallel and show individual links', async () => {
    const mockAccounts: AccountWithPendingStatus[] = [
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'Account 1',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/account1.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
      {
        id: TEST_ACCOUNT_ID_2,
        name: 'Account 2',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/output/account2.beancount',
        rules: [],
        variables: [],
        goCardless: undefined,
        hasPendingImport: false,
      },
    ]

    vi.mocked(getAccountsWithPendingImports).mockResolvedValue(mockAccounts)
    vi.mocked(getImports).mockResolvedValue([])

    // Mock successful streams for both accounts
    const createSuccessStream = (accountName: string, importId: string) =>
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(
            encoder.encode(`Starting import for account: ${accountName}\n`),
          )
          controller.enqueue(
            encoder.encode('Import completed successfully (exit code: 0)\n'),
          )
          controller.enqueue(encoder.encode('__IMPORT_ID__\n'))
          controller.enqueue(encoder.encode(`${importId}\n`))
          controller.close()
        },
      })

    // Mock runImport to return different streams based on accountId
    vi.mocked(runImportAction).mockImplementation((accountId: string) => {
      if (accountId === TEST_ACCOUNT_ID_1) {
        return Promise.resolve(createSuccessStream('Account 1', 'import-id-1'))
      }
      if (accountId === TEST_ACCOUNT_ID_2) {
        return Promise.resolve(createSuccessStream('Account 2', 'import-id-2'))
      }
      throw new Error(`Unexpected accountId: ${accountId}`)
    })

    renderWithQueryClient(<ImportUI />)

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })

    // Select both accounts
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0])
    await userEvent.click(checkboxes[1])

    // Click import button
    const importButton = screen.getByText(/Import Selected/)
    await userEvent.click(importButton)

    // Wait for both imports to complete
    await waitFor(() => {
      expect(screen.getAllByText('Completed')).toHaveLength(2)
    })

    // Verify runImport was called for both accounts in parallel
    expect(runImportAction).toHaveBeenCalledTimes(2)
    expect(runImportAction).toHaveBeenCalledWith(TEST_ACCOUNT_ID_1)
    expect(runImportAction).toHaveBeenCalledWith(TEST_ACCOUNT_ID_2)
  })
})
