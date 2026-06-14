import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import {
  getAirulesLockPath,
  loadAirulesConfig,
  resolveAirulesConfigPath,
} from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export interface DoctorCommandOptions {
  cwd: string
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  const resolvedConfig = resolveAirulesConfigPath(options.cwd)

  if (!resolvedConfig) {
    console.info('airules doctor')
    console.info('✖ Config not found under .agents/agent')
    process.exitCode = 1
    return
  }

  console.info('airules doctor')
  console.info(`✔ Config found: ${resolvedConfig.path}`)

  try {
    await loadAirulesConfig(options.cwd)
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
  }
}
