'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useUpdateTransactionMeta } from '@/hooks/useImports'

interface NoteEditPopoverProps {
  importId: string
  transactionId: string
  currentNote: string
  isOpen: boolean
  onClose: () => void
  anchorElement: HTMLElement | null
}

export default function NoteEditPopover({
  importId,
  transactionId,
  currentNote,
  isOpen,
  onClose,
  anchorElement,
}: NoteEditPopoverProps) {
  const [noteValue, setNoteValue] = useState(currentNote)
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const updateMetaMutation = useUpdateTransactionMeta()

  // Reset noteValue when currentNote changes or popover opens
  useEffect(() => {
    if (isOpen) {
      setNoteValue(currentNote)
    }
  }, [isOpen, currentNote])

  // Auto-focus textarea when popover opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  const hasChanges = noteValue.trim() !== currentNote

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const trimmedNote = noteValue.trim()
      const result = await updateMetaMutation.mutateAsync({
        importId,
        transactionId,
        key: 'note',
        value: trimmedNote.length > 0 ? trimmedNote : null,
      })
      if (result.success) {
        onClose()
      } else {
        alert(`Failed to save note: ${result.error}`)
      }
    } catch (error) {
      alert(
        `Error saving note: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsSaving(false)
    }
  }, [importId, transactionId, noteValue, updateMetaMutation, onClose])

  // Handle Escape key and Ctrl+Enter
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        const currentHasChanges = noteValue.trim() !== currentNote
        if (currentHasChanges && !isSaving) {
          handleSave()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, noteValue, currentNote, isSaving, onClose, handleSave])

  // Calculate popover position
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (isOpen && anchorElement && popoverRef.current) {
      const anchorRect = anchorElement.getBoundingClientRect()
      const popoverRect = popoverRef.current.getBoundingClientRect()

      // Position below and to the left of the anchor
      let top = anchorRect.bottom + 8
      let left = anchorRect.right - popoverRect.width

      // Ensure popover doesn't go off-screen
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Adjust if goes off bottom
      if (top + popoverRect.height > viewportHeight) {
        top = anchorRect.top - popoverRect.height - 8
      }

      // Adjust if goes off left edge
      if (left < 8) {
        left = 8
      }

      // Adjust if goes off right edge
      if (left + popoverRect.width > viewportWidth - 8) {
        left = viewportWidth - popoverRect.width - 8
      }

      setPosition({ top, left })
    }
  }, [isOpen, anchorElement])

  const handleCancel = () => {
    setNoteValue(currentNote)
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-popover-title"
        className="fixed w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3
            id="note-popover-title"
            className="text-sm font-semibold text-gray-900"
          >
            {currentNote ? 'Edit Note' : 'Add Note'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <textarea
            ref={textareaRef}
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="Add a note to this transaction..."
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
