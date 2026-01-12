import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Value, type Transaction, type Node } from 'beancount'
import TransactionCard from './transaction-card'
import {
  createMockTransaction,
  TEST_IDS,
  renderWithQueryClient,
} from '@/test/test-utils'
import { updateTransactionMeta } from '@/app/_actions/imports'
import type { Rule } from '@/lib/db/types'

interface RuleInfo {
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }>
  warnings: string[]
  skippedRuleIds: string[]
}

interface TransactionCardProps {
  nodes: Node[]
  transaction: Transaction
  originalTransaction?: Transaction
  ruleInfo?: RuleInfo
  accountRules?: Rule[]
  accountId: string
  index: number
  importId: string
  transactionId: string
  isSelected: boolean
  onSelectionChange: (selected: boolean) => void
}

// Mock server actions
vi.mock('@/app/_actions/imports', () => ({
  updateTransactionMeta: vi.fn(),
}))

describe('TransactionCard - Note Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createTransactionCardProps(
    overrides: Partial<TransactionCardProps> = {},
  ): TransactionCardProps {
    const defaultTransaction = createMockTransaction({
      date: '2024-01-15',
      payee: 'Test Store',
      narration: 'Test Purchase',
      metadata: {}, // No note initially
    })

    return {
      nodes: [defaultTransaction],
      transaction: defaultTransaction,
      originalTransaction: defaultTransaction,
      ruleInfo: {
        matchedRules: [
          {
            ruleId: 'rule-1',
            ruleName: 'Test Rule',
            actionsApplied: ['add-tag'],
            applicationType: 'automatic',
          },
        ],
        warnings: [],
        skippedRuleIds: [],
      },
      accountRules: [],
      index: 0,
      importId: TEST_IDS.IMPORT_1,
      transactionId: TEST_IDS.TRANSACTION_1,
      isSelected: false,
      onSelectionChange: vi.fn(),
      ...overrides,
      accountId: overrides.accountId ?? 'test-account-id',
    }
  }

  describe('Adding a note to a transaction', () => {
    it('completes full flow: open menu → add note → save → verify UI update', async () => {
      // Arrange
      const props = createTransactionCardProps()
      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Mock server action to return success
      vi.mocked(updateTransactionMeta).mockResolvedValue({ success: true })

      // Act - Expand the card to show the action menu
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      // Act - Open action menu
      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      // Act - Click "Add Note" option
      const addNoteOption = screen.getByRole('menuitem', { name: 'Add Note' })
      await user.click(addNoteOption)

      // Assert - Verify popover opens with correct title
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Add Note')).toBeInTheDocument()

      // Act - Type into textarea
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      await user.type(textarea, 'My test note')

      // Assert - Verify text was entered
      expect(textarea).toHaveValue('My test note')

      // Act - Click Save button
      const saveButton = screen.getByRole('button', { name: 'Save' })
      await user.click(saveButton)

      // Assert - Verify server action called with correct arguments
      // The mutation hook (useUpdateTransactionMeta) wraps this call and handles
      // cache invalidation automatically via React Query's onSuccess callback
      await waitFor(() => {
        expect(vi.mocked(updateTransactionMeta)).toHaveBeenCalledWith(
          TEST_IDS.IMPORT_1,
          TEST_IDS.TRANSACTION_1,
          'note',
          'My test note',
        )
      })

      // Assert - Verify popover closed (indicates successful save)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('closes popover on cancel without saving', async () => {
      // Arrange
      const props = createTransactionCardProps()
      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const addNoteOption = screen.getByRole('menuitem', { name: 'Add Note' })
      await user.click(addNoteOption)

      // Act - Type something
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      await user.type(textarea, 'This should not be saved')

      // Act - Click Cancel button
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Assert - Verify popover closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Assert - Verify server action was NOT called
      expect(vi.mocked(updateTransactionMeta)).not.toHaveBeenCalled()
    })

    it('closes popover on Escape key', async () => {
      // Arrange
      const props = createTransactionCardProps()
      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const addNoteOption = screen.getByRole('menuitem', { name: 'Add Note' })
      await user.click(addNoteOption)

      // Assert - Verify popover is open
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Act - Press Escape key
      await user.keyboard('{Escape}')

      // Assert - Verify popover closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Assert - Verify server action was NOT called
      expect(vi.mocked(updateTransactionMeta)).not.toHaveBeenCalled()
    })

    it('saves note on Cmd/Ctrl+Enter keyboard shortcut', async () => {
      // Arrange
      const props = createTransactionCardProps()
      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Mock server action to return success
      vi.mocked(updateTransactionMeta).mockResolvedValue({ success: true })

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const addNoteOption = screen.getByRole('menuitem', { name: 'Add Note' })
      await user.click(addNoteOption)

      // Act - Type a note
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      await user.type(textarea, 'Quick note')

      // Act - Press Ctrl+Enter (or Cmd+Enter on Mac)
      await user.keyboard('{Control>}{Enter}{/Control}')

      // Assert - Verify server action was called
      await waitFor(() => {
        expect(vi.mocked(updateTransactionMeta)).toHaveBeenCalledWith(
          TEST_IDS.IMPORT_1,
          TEST_IDS.TRANSACTION_1,
          'note',
          'Quick note',
        )
      })

      // Assert - Verify popover closed
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('handles empty note (deletion)', async () => {
      // Arrange - Create transaction with existing note
      const existingNote = 'Original note content'
      const transactionWithNote = createMockTransaction({
        date: '2024-01-15',
        payee: 'Test Store',
        narration: 'Test Purchase',
        metadata: {
          note: new Value({ type: 'string', value: existingNote }),
        },
      })

      const props = createTransactionCardProps({
        transaction: transactionWithNote,
        nodes: [transactionWithNote],
      })

      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Mock server action to return success
      vi.mocked(updateTransactionMeta).mockResolvedValue({ success: true })

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const editNoteOption = screen.getByRole('menuitem', { name: 'Edit Note' })
      await user.click(editNoteOption)

      // Act - Clear the note completely
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      await user.clear(textarea)

      // Act - Click Save button
      const saveButton = screen.getByRole('button', { name: 'Save' })
      await user.click(saveButton)

      // Assert - Verify server action called with null (to delete note)
      await waitFor(() => {
        expect(vi.mocked(updateTransactionMeta)).toHaveBeenCalledWith(
          TEST_IDS.IMPORT_1,
          TEST_IDS.TRANSACTION_1,
          'note',
          null,
        )
      })
    })

    it('handles save error from server', async () => {
      // Arrange
      const props = createTransactionCardProps()
      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Mock server action to return error
      vi.mocked(updateTransactionMeta).mockResolvedValue({
        success: false,
        error: 'Database error',
      })

      // Mock alert to verify it's called
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const addNoteOption = screen.getByRole('menuitem', { name: 'Add Note' })
      await user.click(addNoteOption)

      // Act - Type a note and save
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      await user.type(textarea, 'Test note')

      const saveButton = screen.getByRole('button', { name: 'Save' })
      await user.click(saveButton)

      // Assert - Verify alert shown with error message
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Failed to save note: Database error',
        )
      })

      // Assert - Verify popover stays open after error
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Cleanup
      alertSpy.mockRestore()
    })
  })

  describe('Editing existing note', () => {
    it('shows "Edit Note" option when note exists', async () => {
      // Arrange - Create transaction with existing note
      const transactionWithNote = createMockTransaction({
        date: '2024-01-15',
        payee: 'Test Store',
        narration: 'Test Purchase',
        metadata: {
          note: new Value({ type: 'string', value: 'Existing note' }),
        },
      })

      const props = createTransactionCardProps({
        transaction: transactionWithNote,
        nodes: [transactionWithNote],
      })

      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Assert - Verify note badge is visible in collapsed state
      expect(screen.getByText('Note')).toBeInTheDocument()

      // Act - Expand the card
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      // Act - Open action menu
      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      // Assert - Verify "Edit Note" option appears (not "Add Note")
      expect(
        screen.getByRole('menuitem', { name: 'Edit Note' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('menuitem', { name: 'Add Note' }),
      ).not.toBeInTheDocument()
    })

    it('populates textarea with existing note value', async () => {
      // Arrange - Create transaction with existing note
      const existingNote = 'My existing note content'
      const transactionWithNote = createMockTransaction({
        date: '2024-01-15',
        payee: 'Test Store',
        narration: 'Test Purchase',
        metadata: {
          note: new Value({ type: 'string', value: existingNote }),
        },
      })

      const props = createTransactionCardProps({
        transaction: transactionWithNote,
        nodes: [transactionWithNote],
      })

      renderWithQueryClient(<TransactionCard {...props} />)
      const user = userEvent.setup()

      // Act - Open the note popover
      const expandButton = screen.getByRole('button', { expanded: false })
      await user.click(expandButton)

      const actionMenuButton = screen.getByRole('button', {
        name: 'Transaction actions',
      })
      await user.click(actionMenuButton)

      const editNoteOption = screen.getByRole('menuitem', { name: 'Edit Note' })
      await user.click(editNoteOption)

      // Assert - Verify popover title shows "Edit Note"
      expect(screen.getByText('Edit Note')).toBeInTheDocument()

      // Assert - Verify textarea contains existing note
      const textarea = screen.getByPlaceholderText(
        'Add a note to this transaction...',
      )
      expect(textarea).toHaveValue(existingNote)

      // Assert - Verify Save button is disabled (no changes yet)
      const saveButton = screen.getByRole('button', { name: 'Save' })
      expect(saveButton).toBeDisabled()
    })
  })
})
