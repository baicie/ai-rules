import type { AirulesConfigPack } from '@baicie/airules-schema'
import {
  createDryRunBlockForOperation,
  installPack,
  loadAirulesConfigSync,
  validateSourceSecurity,
} from '@baicie/airules-core'

export interface DiffCommandOptions {
  cwd: string
  name?: string
}

export async function runDiffCommand(
  options: DiffCommandOptions,
): Promise<void> {
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

  for (const pack of packs) {
    await runOne(options.cwd, pack)
  }
}

async function runOne(cwd: string, pack: AirulesConfigPack): Promise<void> {
  const result = await installPack({
    cwd,
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined ? { agents: pack.agents } : {}),
    ...(pack.variables !== undefined ? { variables: pack.variables } : {}),
    dryRun: true,
  })

  console.info(`\n${result.packName}@${result.packVersion}`)

  for (const operation of result.operations) {
    console.info(`\n--- ${operation.target}`)
    console.info(`action: ${operation.action}`)
    console.info(`install: ${operation.agent}:${operation.installId}`)

    if (operation.action === 'unchanged') {
      continue
    }

    console.info('\nmanaged block:\n')
    console.info(createDryRunBlockForOperation(operation))
  }
}
