import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import {
  getAirulesLockPath,
  loadAirulesConfigSync,
  resolveAirulesConfigPath,
  runDoctor,
} from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export interface DoctorCommandOptions {
  cwd: string
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  const resolvedConfig = resolveAirulesConfigPath(options.cwd)

  console.info('airules doctor')

  if (!resolvedConfig) {
    console.info('✖ Config not found under .agents/agent')
    process.exitCode = 1
    return
  }

  console.info(`✔ Config found: ${resolvedConfig.path}`)

  try {
    loadAirulesConfigSync(options.cwd)
    console.info('✔ Config schema valid')
  } catch (error) {
    console.info('✖ Config schema invalid')
    console.info(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const lockPath = getAirulesLockPath(options.cwd)

  if (!existsSync(lockPath)) {
    console.info('⚠ Lockfile not found')
    return
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    AirulesLockfileSchema.parse(lock)
    console.info(`✔ Lockfile valid: ${lockPath}`)
  } catch (error) {
    console.info('✖ Lockfile invalid')
    console.info(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const result = runDoctor({
    cwd: options.cwd,
  })

  for (const issue of result.issues) {
    const prefix =
      issue.severity === 'ok' ? '✔' : issue.severity === 'warning' ? '⚠' : '✖'

    console.info(`${prefix} ${issue.code}: ${issue.message}`)
  }

  if (!result.ok) {
    process.exitCode = 1
  }
}
