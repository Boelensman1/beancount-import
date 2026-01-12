import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Modal from './modal'
import { createMockCallbacks } from '@/test/test-utils'

describe('Modal', () => {
  const { callbacks, reset } = createMockCallbacks()
  const defaultProps = {
    isOpen: true,
    onClose: callbacks.onClose,
    title: 'Test Modal',
    children: <div>Test content</div>,
  }

  beforeEach(() => {
    reset()
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
    expect(callbacks.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', () => {
    const { container } = render(<Modal {...defaultProps} />)
    const overlay = container.firstChild as HTMLElement
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay)
    expect(callbacks.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content is clicked', () => {
    render(<Modal {...defaultProps} />)
    const modalContent = screen.getByText('Test content')
    fireEvent.click(modalContent)
    expect(callbacks.onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<Modal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callbacks.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when other keys are pressed', () => {
    render(<Modal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(callbacks.onClose).not.toHaveBeenCalled()
  })

  it('sets body position to fixed when open', () => {
    render(<Modal {...defaultProps} />)
    expect(document.body.style.position).toBe('fixed')
  })

  it('restores body position when closed', () => {
    const { rerender } = render(<Modal {...defaultProps} />)
    expect(document.body.style.position).toBe('fixed')

    rerender(<Modal {...defaultProps} isOpen={false} />)
    expect(document.body.style.position).toBe('')
  })

  it('restores body position when unmounted', () => {
    const { unmount } = render(<Modal {...defaultProps} />)
    expect(document.body.style.position).toBe('fixed')

    unmount()
    expect(document.body.style.position).toBe('')
  })

  it('does not call onClose on Escape when modal is closed', () => {
    render(<Modal {...defaultProps} isOpen={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callbacks.onClose).not.toHaveBeenCalled()
  })
})
