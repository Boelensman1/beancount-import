import { spawn } from 'child_process'
import { replaceVariables } from '../string/replaceVariables'

export interface PostProcessResult {
  success: boolean
  output: string
  error?: string
}

export async function executePostProcessCommand(
  command: string,
  filePath: string,
  accountName: string,
): Promise<PostProcessResult> {
  const variables = {
    file: filePath,
    account: accountName,
  }

  let replacedCommand: string
  try {
    replacedCommand = replaceVariables(command, variables)
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Variable substitution failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const args = parseCommandArgs(replacedCommand)
  if (args.length === 0) {
    return {
      success: false,
      output: '',
      error: 'Empty command after parsing',
    }
  }

  const commandName = args[0]
  const commandArgs = args.slice(1)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const childProcess = spawn(commandName, commandArgs, {
      shell: false,
      timeout: 30000,
    })

    const timeout = setTimeout(() => {
      timedOut = true
      childProcess.kill()
      resolve({
        success: false,
        output: stdout,
        error: `Command timed out after 30 seconds`,
      })
    }, 30000)

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    childProcess.on('error', (error) => {
      clearTimeout(timeout)
      if (!timedOut) {
        resolve({
          success: false,
          output: stdout,
          error: `Failed to execute command: ${error.message}`,
        })
      }
    })

    childProcess.on('close', (code) => {
      clearTimeout(timeout)
      if (!timedOut) {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout + stderr,
          })
        } else {
          resolve({
            success: false,
            output: stdout,
            error: `Command exited with code ${code}${stderr ? `: ${stderr}` : ''}`,
          })
        }
      }
    })
  })
}

function parseCommandArgs(command: string): string[] {
  const args: string[] = []
  let currentArg = ''
  let inQuotes = false
  let quoteChar = ''

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false
        quoteChar = ''
      } else {
        currentArg += char
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true
        quoteChar = char
      } else if (char === ' ' || char === '\t') {
        if (currentArg.length > 0) {
          args.push(currentArg)
          currentArg = ''
        }
      } else {
        currentArg += char
      }
    }
  }

  if (currentArg.length > 0) {
    args.push(currentArg)
  }

  return args
}
