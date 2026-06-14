import { existsSync, readFileSync } from 'node:fs'
import { getAirulesLockPath } from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export interface ListCommandOptions {
  cwd: string
}

export function runListCommand(options: ListCommandOptions): void {
  const lockPath = getAirulesLockPath(options.cwd)

  if (!existsSync(lockPath)) {
    console.info('No airules lockfile found.')
    return
  }

  const lock = AirulesLockfileSchema.parse(
    JSON.parse(readFileSync(lockPath, 'utf8')),
  )

  if (lock.packs.length === 0) {
    console.info('No airules packs installed.')
    return
  }

  console.info('Installed airules packs:')

  for (const pack of lock.packs) {
    console.info(`- ${pack.name}@${pack.version}`)
    console.info(`  source: ${pack.source}`)
    if (pack.profile) {
      console.info(`  profile: ${pack.profile}`)
    }
    if (pack.agents && pack.agents.length > 0) {
      console.info(`  agents: ${pack.agents.join(', ')}`)
    }
  }
}
