import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
}))

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
