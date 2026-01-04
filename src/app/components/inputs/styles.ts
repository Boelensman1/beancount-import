import { twMerge } from 'tailwind-merge'
import clsx, { type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const INPUT_BASE_STYLES =
  'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'disabled:bg-gray-100 disabled:cursor-not-allowed'

export const ERROR_STYLES = {
  input: 'border-red-500 focus:ring-red-500 focus:border-red-500',
  message: 'mt-1 text-sm text-red-600',
}

export const CHECKBOX_STYLES = 'h-4 w-4 rounded border-gray-300'

export const CHECKBOX_WRAPPER_STYLES = 'flex items-center gap-2'

export const SELECT_BASE_STYLES =
  'w-full rounded border border-gray-300 px-3 py-2'
