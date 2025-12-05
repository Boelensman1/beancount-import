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
    account: accountName,
    outputFile: filePath,
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

  // make timeout shorter in test env for fast tests

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeoutMs = process.env.NODE_ENV === 'test' ? 1000 : 30000

    const childProcess = spawn(replacedCommand, {
      shell: true,
      timeout: timeoutMs,
    })

    const timeout = setTimeout(() => {
      timedOut = true
      childProcess.kill()
      resolve({
        success: false,
        output: stdout,
        error: `Command timed out after 30 seconds`,
      })
    }, timeoutMs)

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
