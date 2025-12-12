import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Modal from './modal'

describe('Modal', () => {
  const mockOnClose = vi.fn()
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    title: 'Test Modal',
    children: <div>Test content</div>,
  }

  beforeEach(() => {
    mockOnClose.mockClear()
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<Modal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).not.toBeVisible()
  })

  it('renders modal with title when isOpen is true', () => {
    render(<Modal {...defaultProps} />)
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(<Modal {...defaultProps} />)
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<Modal {...defaultProps} />)
    const closeButton = screen.getByLabelText('Close modal')
    fireEvent.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', () => {
    const { container } = render(<Modal {...defaultProps} />)
    const overlay = container.firstChild as HTMLElement
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content is clicked', () => {
    render(<Modal {...defaultProps} />)
    const modalContent = screen.getByText('Test content')
    fireEvent.click(modalContent)
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<Modal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when other keys are pressed', () => {
    render(<Modal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('sets body overflow to hidden when open', () => {
    render(<Modal {...defaultProps} />)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body overflow when closed', () => {
    const { rerender } = render(<Modal {...defaultProps} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Modal {...defaultProps} isOpen={false} />)
    expect(document.body.style.overflow).toBe('')
  })

  it('restores body overflow when unmounted', () => {
    const { unmount } = render(<Modal {...defaultProps} />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('does not call onClose on Escape when modal is closed', () => {
    render(<Modal {...defaultProps} isOpen={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
