import type { AirulesConfigPack } from '@baicie/airules-schema'
import process from 'node:process'
import {
  installPack,
  loadAirulesConfigSync,
  validateSourceSecurity,
} from '@baicie/airules-core'

export interface DiffCommandOptions {
  cwd: string
  name?: string
}

export function runDiffCommand(options: DiffCommandOptions): void {
  const config = loadAirulesConfigSync(options.cwd)
  const packs = options.name
    ? config.packs.filter(
        pack => pack.name === options.name || pack.source === options.name,
      )
    : config.packs

  if (packs.length === 0) {
    throw new Error(
      options.name
        ? `Cannot find configured pack "${options.name}".`
        : 'No configured packs found.',
    )
  }

  for (const pack of packs) {
    const securityResult = validateSourceSecurity(pack.source, config.security)
    for (const warning of securityResult.warnings) {
      console.warn(`warning: ${warning}`)
    }
  }

  console.info('airules diff')

  const work = packs.reduce<Promise<void>>(
    (chain, pack) => chain.then(() => runOne(pack)),
    Promise.resolve(),
  )

  work.catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error))
  })
}

function runOne(pack: AirulesConfigPack): Promise<void> {
  return installPack({
    cwd: process.cwd(),
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined ? { agents: pack.agents } : {}),
    dryRun: true,
  }).then(result => {
    console.info(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.info(`\n--- ${operation.target}`)
      console.info(`action: ${operation.action}`)
      console.info(`install: ${operation.agent}:${operation.installId}`)

      if (operation.action === 'unchanged') {
        continue
      }

      console.info('\nmanaged block:\n')
      console.info(operation.managedBlock)
    }
  })
}
