import { removePack } from '@baicie/airules-core'

export interface RemoveCommandOptions {
  cwd: string
  pack: string
  dryRun?: boolean
  force?: boolean
}

export async function runRemoveCommand(
  options: RemoveCommandOptions,
): Promise<void> {
  const result = removePack({
    cwd: options.cwd,
    pack: options.pack,
    dryRun: options.dryRun === true,
    force: options.force === true,
  })

  console.info(options.dryRun ? 'airules remove dry-run' : 'airules remove')

  for (const operation of result.operations) {
    const reason = operation.reason ? ` - ${operation.reason}` : ''
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.installId})${reason}`,
    )
  }
}
