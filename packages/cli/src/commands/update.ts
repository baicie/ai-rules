import type { AirulesConfigPack } from '@baicie/airules-schema'
import { installLocalPack, loadAirulesConfigSync } from '@baicie/airules-core'

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

  console.info(options.dryRun ? 'airules update dry-run' : 'airules update')

  for (const pack of packs) {
    const result = installLocalPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
      dryRun: options.dryRun === true,
    })

    console.info(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.info(
        `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
      )
    }
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
