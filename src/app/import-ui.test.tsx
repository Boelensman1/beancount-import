import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportUI from './import-ui'
import type { Account } from '@/lib/db/types'

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
vi.mock('./actions', () => ({
  runImport: vi.fn(),
  createBatch: vi.fn(),
}))

import { runImport as runImportAction, createBatch } from './actions'

describe('ImportUI', () => {
  it('should render accounts with their names and commands', () => {
    // Arrange: Create mock accounts
    const mockAccounts: Account[] = [
      {
        id: 'account-id-1',
        name: 'Test Account 1',
        importerCommand: 'bean-extract test1.config',
        defaultOutputFile: '/output/account1.beancount',
        rules: [],
      },
      {
        id: 'account-id-2',
        name: 'Test Account 2',
        importerCommand: 'bean-extract test2.config',
        defaultOutputFile: '/output/account2.beancount',
        rules: [],
      },
      {
        id: 'account-id-3',
        name: 'Test Account 3',
        importerCommand: 'python import_script.py --account=3',
        defaultOutputFile: '/output/account3.beancount',
        rules: [],
      },
    ]

    // Act: Render the component
    render(<ImportUI accounts={mockAccounts} batches={[]} />)

    // Assert: Check that account names are rendered
    expect(screen.getByText('Test Account 1')).toBeInTheDocument()
    expect(screen.getByText('Test Account 2')).toBeInTheDocument()
    expect(screen.getByText('Test Account 3')).toBeInTheDocument()
  })
})

describe('ImportUI - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show error status when import fails (no __IMPORT_ID__ marker)', async () => {
    const mockAccounts: Account[] = [
      {
        id: 'account-id-1',
        name: 'Test Account',
        importerCommand: 'exit 1',
        defaultOutputFile: '/output/test.beancount',
        rules: [],
      },
    ]

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

    render(<ImportUI accounts={mockAccounts} batches={[]} />)

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
    const mockAccounts: Account[] = [
      {
        id: 'account-id-1',
        name: 'Test Account',
        importerCommand: 'echo "test"',
        defaultOutputFile: '/output/test.beancount',
        rules: [],
      },
    ]

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

    render(<ImportUI accounts={mockAccounts} batches={[]} />)

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
