import type { AgentName, AirulesConfigPack } from '@baicie/airules-schema'
import process from 'node:process'
import {
  installPack,
  loadAirulesConfigSync,
  validateSourceSecurity,
} from '@baicie/airules-core'

export interface UpdateCommandOptions {
  cwd: string
  name?: string
  dryRun?: boolean
}

export function runUpdateCommand(options: UpdateCommandOptions): void {
  const config = loadAirulesConfigSync(options.cwd)
  const packs = filterPacks(config.packs, options.name)

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

  console.info(options.dryRun ? 'airules update dry-run' : 'airules update')

  const dryRun = options.dryRun === true

  const work = packs.reduce<Promise<void>>(
    (chain, pack) => chain.then(() => runOne(pack, dryRun)),
    Promise.resolve(),
  )

  work.catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error))
  })
}

function runOne(pack: AirulesConfigPack, dryRun: boolean): Promise<void> {
  return installPack({
    cwd: process.cwd(),
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined
      ? { agents: pack.agents as AgentName[] }
      : {}),
    dryRun,
  }).then(result => {
    console.info(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.info(
        `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
      )
    }
  })
}

function filterPacks(
  packs: AirulesConfigPack[],
  name: string | undefined,
): AirulesConfigPack[] {
  if (!name) {
    return packs
  }

  const filtered: AirulesConfigPack[] = []
  for (const pack of packs) {
    if (pack.name === name || pack.source === name) {
      filtered.push(pack)
    }
  }
  return filtered
}
