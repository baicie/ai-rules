import { installLocalPack, loadAirulesConfigSync } from '@baicie/airules-core'

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

  console.info('airules diff')

  for (const pack of packs) {
    const result = installLocalPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
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
      console.info(operation.managedBlock)
    }
  }
}
