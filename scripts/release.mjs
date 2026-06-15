import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  defineReleaseConfig,
  runPrecheckCli,
  runPublishCli,
  runReadinessCli,
  runReleaseCli,
  runReleasePlanCli,
  runVersionPackagesCli,
} from '@baicie/release'

const config = defineReleaseConfig({
  repo: 'baicie/ai-rules',
  repositoryUrl: 'https://github.com/baicie/ai-rules',
  mode: 'workspace-fixed',
  packageManager: 'pnpm',
  rootPackageJson: false,
  changelogFile: 'CHANGELOG.md',

  workspace: {
    roots: ['packages'],
    publishable(pkg) {
      return (
        pkg.packageJson.private !== true
        && pkg.name.startsWith('@baicie/airules')
      )
    },
    packageKind(relativeDir) {
      if (relativeDir === 'packages/schema')
        return '0-schema'
      if (relativeDir === 'packages/core')
        return '1-core'
      if (relativeDir === 'packages/cli')
        return '2-cli'
      return '9-other'
    },
  },

  publish: {
    access: 'public',
    provenance: true,
    registry: 'https://registry.npmjs.org/',
    skipExisting: true,
    retry: 5,
  },

  precheck: {
    commands: [
      ['pnpm', 'check'],
      ['pnpm', 'release:readiness', '--strict'],
    ],
    verifyCommand: false,
  },

  readiness: {
    common: true,
    strict: true,
    allowZero: false,
    package(pkg) {
      const errors = []

      if (pkg.name === '@baicie/airules') {
        const bin = pkg.packageJson.bin
        const hasAirulesBin
          = typeof bin === 'object'
            && bin !== null
            && bin.airules === './dist/bin.js'

        if (!hasAirulesBin) {
          errors.push('@baicie/airules: bin.airules must point to ./dist/bin.js')
        }
      }

      return errors
    },
  },

  afterVersion(ctx) {
    const cwd = ctx.config.cwd ?? process.cwd()
    const versionFile = resolve(cwd, 'packages/cli/src/version.ts')
    writeFileSync(
      versionFile,
      `export const AIRULES_VERSION = '${ctx.version}'\n`,
    )
  },
})

const rawArgs = process.argv.slice(2)
const filteredArgs = []
let i = 0
while (i < rawArgs.length) {
  const arg = rawArgs[i]
  if (arg === '--') {
    i += 1
    while (i < rawArgs.length) {
      filteredArgs.push(rawArgs[i])
      i += 1
    }
    break
  }
  filteredArgs.push(arg)
  i += 1
}

const command = filteredArgs[0] ?? 'release'
const args = filteredArgs.slice(1)
process.argv = [process.argv[0], process.argv[1], ...args]

try {
  switch (command) {
    case 'release':
      await runReleaseCli(config)
      break

    case 'publish':
      await runPublishCli(config)
      break

    case 'precheck':
      await runPrecheckCli(config)
      break

    case 'readiness':
      await runReadinessCli(config)
      break

    case 'plan':
      await runReleasePlanCli(config)
      break

    case 'version':
      await runVersionPackagesCli(config)
      break

    default:
      throw new Error(
        `Unknown release command "${command}". Expected release, publish, precheck, readiness, plan, or version.`,
      )
  }
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
