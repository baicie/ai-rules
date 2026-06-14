#!/usr/bin/env node
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { runAddCommand } from './commands/add'
import { runDiffCommand } from './commands/diff'
import { runDoctorCommand } from './commands/doctor'
import { runInitCommand } from './commands/init'
import { runListCommand } from './commands/list'
import { runUpdateCommand } from './commands/update'

export function runCli(argv = process.argv): void {
  const cli = cac('airules')

  cli
    .command('init', 'Initialize airules in the current repository')
    .option('--force', 'Overwrite existing config and lock files')
    .action((options: { force?: boolean }) => {
      runInitCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
      })
    })

  cli
    .command('add <source>', 'Install a local airules pack')
    .option('--profile <profile>', 'Profile name')
    .option('--agent <agents>', 'Comma-separated agent names')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--no-save', 'Do not save the pack into airules config')
    .action(
      (
        source: string,
        options: {
          profile?: string
          agent?: string
          dryRun?: boolean
          save?: boolean
        },
      ) => {
        runAddCommand({
          cwd: process.cwd(),
          source,
          profile: options.profile,
          agent: options.agent,
          dryRun: Boolean(options.dryRun),
          save: options.save,
        })
      },
    )

  cli
    .command('update [name]', 'Reinstall configured airules packs')
    .option('--dry-run', 'Preview changes without writing files')
    .action((name: string | undefined, options: { dryRun?: boolean }) => {
      runUpdateCommand({
        cwd: process.cwd(),
        name,
        dryRun: Boolean(options.dryRun),
      })
    })

  cli
    .command('diff [name]', 'Preview configured airules pack changes')
    .action((name: string | undefined) => {
      runDiffCommand({
        cwd: process.cwd(),
        name,
      })
    })

  cli.command('doctor', 'Check airules configuration').action(() => {
    runDoctorCommand({
      cwd: process.cwd(),
    })
  })

  cli
    .command('list', 'List installed airules packs from lockfile')
    .action(() => {
      runListCommand({
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
  process.on('unhandledRejection', reason => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(message)
    process.exitCode = 1
  })

  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
