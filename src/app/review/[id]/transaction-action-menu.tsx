'use client'

import { useState, useRef, useEffect } from 'react'
import {
  EllipsisVerticalIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

interface TransactionActionMenuProps {
  hasNote: boolean
  isReExecuting: boolean
  onReExecuteRules: () => void
  onAddEditNote: (anchorElement: HTMLElement) => void
}

export default function TransactionActionMenu({
  hasNote,
  isReExecuting,
  onReExecuteRules,
  onAddEditNote,
}: TransactionActionMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isMenuOpen])

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleReExecute = () => {
    setIsMenuOpen(false)
    onReExecuteRules()
  }

  const handleNoteClick = () => {
    setIsMenuOpen(false)
    if (menuButtonRef.current) {
      onAddEditNote(menuButtonRef.current)
    }
  }

  // Keyboard navigation for menu items
  const handleMenuKeyDown = (
    event: React.KeyboardEvent,
    action: () => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  return (
    <div className="relative">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={handleMenuToggle}
        aria-label="Transaction actions"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleNoteClick}
            onKeyDown={(e) => handleMenuKeyDown(e, handleNoteClick)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            <DocumentTextIcon className="h-4 w-4 text-gray-500" />
            <span>{hasNote ? 'Edit Note' : 'Add Note'}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleReExecute}
            onKeyDown={(e) => handleMenuKeyDown(e, handleReExecute)}
            disabled={isReExecuting}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className="h-4 w-4 text-gray-500" />
            <span>
              {isReExecuting ? 'Re-running Rules...' : 'Re-run Rules'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
