import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ConfirmModal from './confirm-modal'

describe('ConfirmModal', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    title: 'Confirm Action',
    message: 'Are you sure you want to continue?',
  }

  beforeEach(() => {
    mockOnClose.mockClear()
    mockOnConfirm.mockClear()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal {...defaultProps} isOpen={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal with title and message when isOpen is true', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByText('Confirm Action')).toBeInTheDocument()
    expect(
      screen.getByText('Are you sure you want to continue?'),
    ).toBeInTheDocument()
  })

  it('renders default button labels', () => {
    render(<ConfirmModal {...defaultProps} />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('renders custom button labels', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        cancelLabel="No"
        confirmLabel="Yes, Delete"
      />,
    )
    expect(screen.getByText('No')).toBeInTheDocument()
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />)
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  it('calls both onConfirm and onClose when confirm button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />)
    const confirmButton = screen.getByText('Confirm')
    fireEvent.click(confirmButton)
    expect(mockOnConfirm).toHaveBeenCalledTimes(1)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('applies custom button class to confirm button', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />,
    )
    const confirmButton = screen.getByText('Confirm')
    expect(confirmButton.className).toContain('bg-red-600')
    expect(confirmButton.className).toContain('hover:bg-red-700')
  })

  it('renders multi-line messages with whitespace-pre-wrap', () => {
    const { container } = render(
      <ConfirmModal {...defaultProps} message="Line 1\nLine 2\nLine 3" />,
    )
    const message = container.querySelector('.whitespace-pre-wrap')
    expect(message).toBeInTheDocument()
    expect(message).toHaveTextContent('Line 1')
    expect(message).toHaveTextContent('Line 2')
    expect(message).toHaveTextContent('Line 3')
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<ConfirmModal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalledTimes(1)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  it('calls onClose when overlay is clicked', () => {
    const { container } = render(<ConfirmModal {...defaultProps} />)
    const overlay = container.firstChild as HTMLElement
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })
})
