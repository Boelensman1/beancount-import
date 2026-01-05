import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from '@js-temporal/polyfill'
import ConfigForm from '../config-form'
import type { SerializedConfig, SerializedAccount } from '@/lib/db/types'

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

const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001'

interface ConfigOverrides {
  goCardlessConnected?: boolean
  reversePayee?: boolean
  defaults?: Partial<{
    beangulpCommand: string
    postProcessCommand: string
    csvPostProcessCommand: string
  }>
  goCardless?: {
    secretId: string
    secretKey: string
  }
  accounts?: SerializedAccount[]
}

function createSerializedConfig(
  overrides: ConfigOverrides = {},
): SerializedConfig {
  const {
    goCardlessConnected = false,
    reversePayee = false,
    defaults: defaultsOverrides,
    goCardless,
    accounts: accountsOverride,
  } = overrides

  // Calculate future date properly using zonedDateTime
  const futureDate = Temporal.Now.zonedDateTimeISO()
    .add({ days: 30 })
    .toInstant()
    .toString()

  const defaultAccount: SerializedAccount = {
    id: TEST_ACCOUNT_ID,
    name: 'Test Account',
    csvFilename: 'test.csv',
    defaultOutputFile: '/output/test.beancount',
    rules: [],
    variables: [],
    goCardless: goCardlessConnected
      ? {
          countryCode: 'GB',
          bankId: 'TEST_BANK',
          reqRef: 'test-ref',
          accounts: ['00000000-0000-4000-8000-000000000002'],
          importedTill: '2024-11-01',
          endUserAgreementValidTill: futureDate,
          reversePayee,
        }
      : undefined,
  }

  return {
    defaults: {
      beangulpCommand: defaultsOverrides?.beangulpCommand ?? 'test-command',
      postProcessCommand: defaultsOverrides?.postProcessCommand,
      csvPostProcessCommand: defaultsOverrides?.csvPostProcessCommand,
    },
    goCardless,
    accounts: accountsOverride ?? [defaultAccount],
  }
}

function extractFormData(mockFn: ReturnType<typeof vi.fn>) {
  const formData = mockFn.mock.calls[0][0] as FormData
  return {
    accounts: JSON.parse(formData.get('accounts') as string),
    defaults: JSON.parse(formData.get('defaults') as string),
    goCardless: formData.get('goCardless')
      ? JSON.parse(formData.get('goCardless') as string)
      : undefined,
  }
}

describe('ConfigForm', () => {
  const mockUpdateConfig = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Default Settings Section', () => {
    it('should render all default settings fields', () => {
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByText('Default Settings')).toBeInTheDocument()
      expect(document.getElementById('beangulp-command')).toBeInTheDocument()
      expect(
        document.getElementById('defaults-post-process-command'),
      ).toBeInTheDocument()
      expect(
        document.getElementById('defaults-csv-post-process-command'),
      ).toBeInTheDocument()
    })

    it('should display initial default values', () => {
      const config = createSerializedConfig({
        accounts: [],
        defaults: {
          beangulpCommand: 'my-beangulp-cmd',
          postProcessCommand: 'my-post-process',
          csvPostProcessCommand: 'my-csv-post-process',
        },
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(document.getElementById('beangulp-command')).toHaveValue(
        'my-beangulp-cmd',
      )
      expect(
        document.getElementById('defaults-post-process-command'),
      ).toHaveValue('my-post-process')
      expect(
        document.getElementById('defaults-csv-post-process-command'),
      ).toHaveValue('my-csv-post-process')
    })

    it('should allow editing beangulpCommand', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = document.getElementById('beangulp-command')!
      await user.clear(input)
      await user.type(input, 'new-command')

      expect(input).toHaveValue('new-command')
    })

    it('should allow editing postProcessCommand', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = document.getElementById('defaults-post-process-command')!
      await user.type(input, 'post-process-cmd')

      expect(input).toHaveValue('post-process-cmd')
    })

    it('should allow editing csvPostProcessCommand', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = document.getElementById(
        'defaults-csv-post-process-command',
      )!
      await user.type(input, 'csv-post-cmd')

      expect(input).toHaveValue('csv-post-cmd')
    })
  })

  describe('GoCardless Integration Section', () => {
    it('should render GoCardless fields', () => {
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByText('GoCardless Integration')).toBeInTheDocument()
      expect(screen.getByLabelText('Secret ID')).toBeInTheDocument()
      expect(screen.getByLabelText('Secret Key')).toBeInTheDocument()
    })

    it('should display initial GoCardless values', () => {
      const config = createSerializedConfig({
        goCardless: {
          secretId: 'my-secret-id',
          secretKey: 'my-secret-key',
        },
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByLabelText('Secret ID')).toHaveValue('my-secret-id')
      expect(screen.getByLabelText('Secret Key')).toHaveValue('my-secret-key')
    })

    it('should allow editing secretId', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = screen.getByLabelText('Secret ID')
      await user.type(input, 'new-secret-id')

      expect(input).toHaveValue('new-secret-id')
    })

    it('should allow editing secretKey', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = screen.getByLabelText('Secret Key')
      await user.type(input, 'new-secret-key')

      expect(input).toHaveValue('new-secret-key')
    })

    it('should render secretKey as password type', () => {
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByLabelText('Secret Key')).toHaveAttribute(
        'type',
        'password',
      )
    })
  })

  describe('Account Management', () => {
    it('should show empty state when no accounts', () => {
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByText(/No accounts configured/)).toBeInTheDocument()
    })

    it('should add new account when Add Account clicked', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Add Account' }))

      expect(screen.getByText('Account 1')).toBeInTheDocument()
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Default Output File')).toBeInTheDocument()
      expect(screen.getByLabelText('CSV Filename')).toBeInTheDocument()
    })

    it('should add multiple accounts', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Add Account' }))
      await user.click(screen.getByRole('button', { name: 'Add Account' }))

      expect(screen.getByText('Account 1')).toBeInTheDocument()
      expect(screen.getByText('Account 2')).toBeInTheDocument()
    })

    it('should set default csvFilename for new accounts', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({ accounts: [] })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Add Account' }))

      expect(screen.getByLabelText('CSV Filename')).toHaveValue(
        '$account.$importedFrom.$importedTo.grabber.csv',
      )
    })

    it('should remove account when Remove button clicked', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByText('Account 1')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Remove' }))

      expect(screen.queryByText('Account 1')).not.toBeInTheDocument()
      expect(screen.getByText(/No accounts configured/)).toBeInTheDocument()
    })

    it('should display initial account values', () => {
      const config = createSerializedConfig({
        accounts: [
          {
            id: TEST_ACCOUNT_ID,
            name: 'My Account',
            csvFilename: 'my-file.csv',
            defaultOutputFile: '/path/to/output.beancount',
            rules: [],
            variables: [],
            goCardless: undefined,
          },
        ],
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(screen.getByLabelText('Name')).toHaveValue('My Account')
      expect(screen.getByLabelText('Default Output File')).toHaveValue(
        '/path/to/output.beancount',
      )
      expect(screen.getByLabelText('CSV Filename')).toHaveValue('my-file.csv')
    })

    it('should allow editing account name', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = screen.getByLabelText('Name')
      await user.clear(input)
      await user.type(input, 'New Account Name')

      expect(input).toHaveValue('New Account Name')
    })

    it('should allow editing defaultOutputFile', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = screen.getByLabelText('Default Output File')
      await user.clear(input)
      await user.type(input, '/new/path.beancount')

      expect(input).toHaveValue('/new/path.beancount')
    })

    it('should allow editing csvFilename', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const input = screen.getByLabelText('CSV Filename')
      await user.clear(input)
      await user.type(input, 'new-file.csv')

      expect(input).toHaveValue('new-file.csv')
    })
  })

  describe('Form Submission', () => {
    it('should call updateConfig when Save Config clicked', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledTimes(1)
      })
    })

    it('should include defaults in FormData', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig({
        defaults: {
          beangulpCommand: 'my-command',
          postProcessCommand: 'post-cmd',
        },
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      const { defaults } = extractFormData(mockUpdateConfig)
      expect(defaults.beangulpCommand).toBe('my-command')
      expect(defaults.postProcessCommand).toBe('post-cmd')
    })

    it('should include accounts in FormData', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig({
        accounts: [
          {
            id: TEST_ACCOUNT_ID,
            name: 'Test Account',
            csvFilename: 'test.csv',
            defaultOutputFile: '/output.beancount',
            rules: [],
            variables: [],
            goCardless: undefined,
          },
        ],
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      const { accounts } = extractFormData(mockUpdateConfig)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('Test Account')
      expect(accounts[0].csvFilename).toBe('test.csv')
    })

    it('should include goCardless in FormData when set', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig({
        goCardless: {
          secretId: 'test-id',
          secretKey: 'test-key',
        },
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      const { goCardless } = extractFormData(mockUpdateConfig)
      expect(goCardless).toEqual({
        secretId: 'test-id',
        secretKey: 'test-key',
      })
    })

    it('should not include goCardless in FormData when not set', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      const { goCardless } = extractFormData(mockUpdateConfig)
      expect(goCardless).toBeUndefined()
    })

    it('should show success message after successful save', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved successfully!',
      })
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(
          screen.getByText('Config saved successfully!'),
        ).toBeInTheDocument()
      })
    })

    it('should show error message after failed save', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: false,
        message: 'Failed to save config',
      })
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to save config')).toBeInTheDocument()
      })
    })

    it('should include updated field values in FormData', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })
      const config = createSerializedConfig()

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      // Edit the account name
      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Account')

      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      const { accounts } = extractFormData(mockUpdateConfig)
      expect(accounts[0].name).toBe('Updated Account')
    })
  })

  describe('GoCardless reversePayee checkbox', () => {
    it('should display checkbox when GoCardless is connected', () => {
      const config = createSerializedConfig({ goCardlessConnected: true })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(
        screen.getByText('Reverse payee (swap debtor/creditor)'),
      ).toBeInTheDocument()
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    it('should not display checkbox when GoCardless is not connected', () => {
      const config = createSerializedConfig({ goCardlessConnected: false })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      expect(
        screen.queryByText('Reverse payee (swap debtor/creditor)'),
      ).not.toBeInTheDocument()
    })

    it('should toggle checkbox state when clicked', async () => {
      const user = userEvent.setup()
      const config = createSerializedConfig({
        goCardlessConnected: true,
        reversePayee: false,
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()

      await user.click(checkbox)

      expect(checkbox).toBeChecked()
    })

    it('should show checked state when reversePayee is true', () => {
      const config = createSerializedConfig({
        goCardlessConnected: true,
        reversePayee: true,
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
    })

    it('should show unchecked state when reversePayee is false', () => {
      const config = createSerializedConfig({
        goCardlessConnected: true,
        reversePayee: false,
      })

      render(
        <ConfigForm
          serializedInitialConfig={config}
          updateConfig={mockUpdateConfig}
        />,
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
    })

    it('should include reversePayee in FormData when toggled and saved', async () => {
      const user = userEvent.setup()
      mockUpdateConfig.mockResolvedValue({
        success: true,
        message: 'Config saved!',
      })

      const initialConfig = createSerializedConfig({
        goCardlessConnected: true,
        reversePayee: false,
      })

      const { rerender } = render(
        <ConfigForm
          serializedInitialConfig={initialConfig}
          updateConfig={mockUpdateConfig}
        />,
      )

      // Toggle checkbox to true
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      // Save
      await user.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalled()
      })

      // Verify reversePayee was included in the FormData
      const { accounts } = extractFormData(mockUpdateConfig)
      expect(accounts[0].goCardless.reversePayee).toBe(true)

      // Simulate server revalidation - Next.js would re-render with updated props
      const updatedConfig = createSerializedConfig({
        goCardlessConnected: true,
        reversePayee: true, // Server saved the new value
      })
      await act(async () => {
        rerender(
          <ConfigForm
            serializedInitialConfig={updatedConfig}
            updateConfig={mockUpdateConfig}
          />,
        )
      })

      // Verify checkbox shows the persisted state from server
      expect(screen.getByRole('checkbox')).toBeChecked()
    })
  })
})
