#!/usr/bin/env node
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { runDoctorCommand } from './commands/doctor'
import { runInitCommand } from './commands/init'
import { runListCommand } from './commands/list'

export function runCli(argv = process.argv): void {
  const cli = cac('airules')

  cli
    .command('init', 'Initialize airules in the current repository')
    .option('--force', 'Overwrite existing config and lock files')
    .action(async (options: { force?: boolean }) => {
      await runInitCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
      })
    })

  cli.command('doctor', 'Check airules configuration').action(async () => {
    await runDoctorCommand({
      cwd: process.cwd(),
    })
  })

  cli
    .command('list', 'List installed airules packs from lockfile')
    .action(async () => {
      await runListCommand({
        cwd: process.cwd(),
      })
    })

  cli.help()
  cli.version('0.0.0')
  cli.parse(argv)
}

function isCliEntry(metaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    return false
  }

  return fileURLToPath(metaUrl) === resolve(argv1)
}

if (isCliEntry(import.meta.url, process.argv[1])) {
  runCli()
}
