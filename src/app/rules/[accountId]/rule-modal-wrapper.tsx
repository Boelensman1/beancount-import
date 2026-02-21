'use client'

import { useRouter, usePathname } from 'next/navigation'
import { RuleForm } from '../rule-form'
import type { Rule } from '@/lib/db/types'

interface RuleModalWrapperProps {
  accountId: string
  rule?: Rule // Optional - undefined for create
}

export function RuleModalWrapper({ accountId, rule }: RuleModalWrapperProps) {
  const router = useRouter()
  const pathname = usePathname()

  const expectedPath = rule
    ? `/rules/${accountId}/${rule.id}`
    : `/rules/${accountId}/new`
  const isOpen = pathname === expectedPath

  const handleClose = () => {
    router.push(`/rules/${accountId}`)
  }

  const handleSuccess = () => {
    router.push(`/rules/${accountId}`)
  }

  return (
    <RuleForm
      accountId={accountId}
      rule={rule}
      isOpen={isOpen}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  )
}
