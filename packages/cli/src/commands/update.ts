import type { AgentName, AirulesConfigPack } from '@baicie/airules-schema'
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

export async function runUpdateCommand(
  options: UpdateCommandOptions,
): Promise<void> {
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

  for (const pack of packs) {
    await runOne(options.cwd, pack, options.dryRun === true)
  }
}

async function runOne(
  cwd: string,
  pack: AirulesConfigPack,
  dryRun: boolean,
): Promise<void> {
  const result = await installPack({
    cwd,
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined
      ? { agents: pack.agents as AgentName[] }
      : {}),
    dryRun,
  })

  console.info(`\n${result.packName}@${result.packVersion}`)

  for (const operation of result.operations) {
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
    )
  }
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
