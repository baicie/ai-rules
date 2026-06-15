#!/usr/bin/env node
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { runAddCommand } from './commands/add'
import {
  runCreatePackCommand,
  runCreateRegistryCommand,
  runCreateSkillCommand,
} from './commands/create'
import { runDiffCommand } from './commands/diff'
import { runDoctorCommand } from './commands/doctor'
import { runInitCommand } from './commands/init'
import { runListCommand } from './commands/list'
import { runPackBuildCommand, runPackValidateCommand } from './commands/pack'
import { runPruneCommand } from './commands/prune'
import { runRegistryListCommand } from './commands/registry'
import { runRegistryPublishCommand } from './commands/registry-publish'
import { runRemoveCommand } from './commands/remove'
import { runSearchCommand } from './commands/search'
import { runUpdateCommand } from './commands/update'
import { AIRULES_VERSION } from './version'

export function runCli(argv = process.argv): void {
  const cli = cac('airules')

  cli
    .command('init', 'Initialize airules in the current repository')
    .option('--force', 'Overwrite existing config and lock files')
    .option('--no-skill', 'Do not create .agents/skills/airules/SKILL.md')
    .action(async (options: { force?: boolean; skill?: boolean }) => {
      await runInitCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
        noSkill: options.skill === false,
      })
    })

  cli
    .command('add <source>', 'Install an airules pack')
    .option('--profile <profile>', 'Profile name')
    .option('--agent <agents>', 'Comma-separated agent names')
    .option('--registry <registry>', 'Override registry source for named packs')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--no-save', 'Do not save the pack into airules config')
    .action(
      async (
        source: string,
        options: {
          profile?: string
          agent?: string
          registry?: string
          dryRun?: boolean
          save?: boolean
        },
      ) => {
        await runAddCommand({
          cwd: process.cwd(),
          source,
          profile: options.profile,
          agent: options.agent,
          registry: options.registry,
          dryRun: Boolean(options.dryRun),
          save: options.save,
        })
      },
    )

  cli
    .command('create pack <name>', 'Create an airules pack scaffold')
    .option('--force', 'Overwrite existing scaffold files')
    .action(async (name: string, options: { force?: boolean }) => {
      await runCreatePackCommand({
        cwd: process.cwd(),
        name,
        force: Boolean(options.force),
      })
    })

  cli
    .command('create-pack <name>', 'Create an airules pack scaffold')
    .option('--force', 'Overwrite existing scaffold files')
    .action(async (name: string, options: { force?: boolean }) => {
      await runCreatePackCommand({
        cwd: process.cwd(),
        name,
        force: Boolean(options.force),
      })
    })

  cli
    .command('create skill <name>', 'Create an airules skill scaffold')
    .option('--force', 'Overwrite existing skill files')
    .action(async (name: string, options: { force?: boolean }) => {
      await runCreateSkillCommand({
        cwd: process.cwd(),
        name,
        force: Boolean(options.force),
      })
    })

  cli
    .command('create-skill <name>', 'Create an airules skill scaffold')
    .option('--force', 'Overwrite existing skill files')
    .action(async (name: string, options: { force?: boolean }) => {
      await runCreateSkillCommand({
        cwd: process.cwd(),
        name,
        force: Boolean(options.force),
      })
    })

  cli
    .command('create registry', 'Create a registry.json scaffold')
    .option('--force', 'Overwrite existing registry file')
    .action(async (options: { force?: boolean }) => {
      await runCreateRegistryCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
      })
    })

  cli
    .command('create-registry', 'Create a registry.json scaffold')
    .option('--force', 'Overwrite existing registry file')
    .action(async (options: { force?: boolean }) => {
      await runCreateRegistryCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
      })
    })

  cli
    .command('pack validate <pack>', 'Validate an airules pack')
    .action(async (packPath: string) => {
      await runPackValidateCommand({
        cwd: process.cwd(),
        packPath,
      })
    })

  cli
    .command('pack-validate <pack>', 'Validate an airules pack')
    .action(async (packPath: string) => {
      await runPackValidateCommand({
        cwd: process.cwd(),
        packPath,
      })
    })

  cli
    .command(
      'pack build <pack>',
      'Build an airules pack into an output directory',
    )
    .option('--out <out>', 'Output directory')
    .option('--no-clean', 'Do not clean output directory before build')
    .action(
      async (
        packPath: string,
        options: {
          out?: string
          clean?: boolean
        },
      ) => {
        await runPackBuildCommand({
          cwd: process.cwd(),
          packPath,
          out: options.out,
          noClean: options.clean === false,
        })
      },
    )

  cli
    .command(
      'pack-build <pack>',
      'Build an airules pack into an output directory',
    )
    .option('--out <out>', 'Output directory')
    .option('--no-clean', 'Do not clean output directory before build')
    .action(
      async (
        packPath: string,
        options: {
          out?: string
          clean?: boolean
        },
      ) => {
        await runPackBuildCommand({
          cwd: process.cwd(),
          packPath,
          out: options.out,
          noClean: options.clean === false,
        })
      },
    )

  cli
    .command('search [query]', 'Search configured airules registries')
    .option('--registry <registry>', 'Override registry source')
    .action(
      async (
        query: string | undefined,
        options: {
          registry?: string
        },
      ) => {
        await runSearchCommand({
          cwd: process.cwd(),
          query,
          registry: options.registry,
        })
      },
    )

  cli
    .command('registry list', 'List configured airules registries')
    .option('--registry <registry>', 'Override registry source')
    .action(async (options: { registry?: string }) => {
      await runRegistryListCommand({
        cwd: process.cwd(),
        registry: options.registry,
      })
    })

  cli
    .command('registries', 'List configured airules registries')
    .option('--registry <registry>', 'Override registry source')
    .action(async (options: { registry?: string }) => {
      await runRegistryListCommand({
        cwd: process.cwd(),
        registry: options.registry,
      })
    })

  cli
    .command(
      'registry publish <pack>',
      'Publish a pack entry into registry.json',
    )
    .option('--registry <registry>', 'Registry json path')
    .option('--source <source>', 'Resolved source to write into registry')
    .option('--alias <aliases>', 'Comma-separated aliases')
    .option('--tag <tags>', 'Comma-separated tags')
    .option('--description <description>', 'Override description')
    .option('--homepage <homepage>', 'Homepage URL')
    .option('--deprecated <reason>', 'Mark as deprecated')
    .option('--default', 'Mark this pack as registry defaultPack')
    .action(
      async (
        packPath: string,
        options: {
          registry?: string
          source?: string
          alias?: string
          tag?: string
          description?: string
          homepage?: string
          deprecated?: string
          default?: boolean
        },
      ) => {
        if (options.registry === undefined) {
          throw new Error('--registry is required.')
        }

        if (options.source === undefined) {
          throw new Error('--source is required.')
        }

        await runRegistryPublishCommand({
          cwd: process.cwd(),
          packPath,
          registry: options.registry,
          source: options.source,
          alias: options.alias,
          tag: options.tag,
          description: options.description,
          homepage: options.homepage,
          deprecated: options.deprecated,
          makeDefault: Boolean(options.default),
        })
      },
    )

  cli
    .command(
      'registry-publish <pack>',
      'Publish a pack entry into registry.json',
    )
    .option('--registry <registry>', 'Registry json path')
    .option('--source <source>', 'Resolved source to write into registry')
    .option('--alias <aliases>', 'Comma-separated aliases')
    .option('--tag <tags>', 'Comma-separated tags')
    .option('--description <description>', 'Override description')
    .option('--homepage <homepage>', 'Homepage URL')
    .option('--deprecated <reason>', 'Mark as deprecated')
    .option('--default', 'Mark this pack as registry defaultPack')
    .action(
      async (
        packPath: string,
        options: {
          registry?: string
          source?: string
          alias?: string
          tag?: string
          description?: string
          homepage?: string
          deprecated?: string
          default?: boolean
        },
      ) => {
        if (options.registry === undefined) {
          throw new Error('--registry is required.')
        }

        if (options.source === undefined) {
          throw new Error('--source is required.')
        }

        await runRegistryPublishCommand({
          cwd: process.cwd(),
          packPath,
          registry: options.registry,
          source: options.source,
          alias: options.alias,
          tag: options.tag,
          description: options.description,
          homepage: options.homepage,
          deprecated: options.deprecated,
          makeDefault: Boolean(options.default),
        })
      },
    )

  cli
    .command('update [name]', 'Reinstall configured airules packs')
    .option('--dry-run', 'Preview changes without writing files')
    .action(async (name: string | undefined, options: { dryRun?: boolean }) => {
      await runUpdateCommand({
        cwd: process.cwd(),
        name,
        dryRun: Boolean(options.dryRun),
      })
    })

  cli
    .command('diff [name]', 'Preview configured airules pack changes')
    .action(async (name: string | undefined) => {
      await runDiffCommand({
        cwd: process.cwd(),
        name,
      })
    })

  cli
    .command('remove <pack>', 'Remove an installed airules pack')
    .option('--dry-run', 'Preview removal without writing files')
    .option('--force', 'Remove generated files even if they were modified')
    .action(
      async (
        pack: string,
        options: {
          dryRun?: boolean
          force?: boolean
        },
      ) => {
        await runRemoveCommand({
          cwd: process.cwd(),
          pack,
          dryRun: Boolean(options.dryRun),
          force: Boolean(options.force),
        })
      },
    )

  cli
    .command('prune', 'Prune stale airules lock entries')
    .option('--dry-run', 'Preview prune without writing lockfile')
    .action(async (options: { dryRun?: boolean }) => {
      await runPruneCommand({
        cwd: process.cwd(),
        dryRun: Boolean(options.dryRun),
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
  cli.version(AIRULES_VERSION)
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
