import { pruneAirules } from '@baicie/airules-core'

export interface PruneCommandOptions {
  cwd: string
  dryRun?: boolean
}

export async function runPruneCommand(
  options: PruneCommandOptions,
): Promise<void> {
  const result = pruneAirules({
    cwd: options.cwd,
    dryRun: options.dryRun === true,
  })

  console.info(options.dryRun ? 'airules prune dry-run' : 'airules prune')

  for (const operation of result.operations) {
    console.info(
      `- ${operation.action}: ${operation.pack}:${operation.installId} - ${operation.reason}`,
    )
  }
}
