import process from 'node:process'
import { buildPack, validatePack } from '@baicie/airules-core'

export interface PackValidateCommandOptions {
  cwd: string
  packPath: string
}

export interface PackBuildCommandOptions {
  cwd: string
  packPath: string
  out?: string
  noClean?: boolean
}

export async function runPackValidateCommand(
  options: PackValidateCommandOptions,
): Promise<void> {
  const result = validatePack({
    cwd: options.cwd,
    packPath: options.packPath,
  })

  console.info('airules pack validate')

  for (const issue of result.issues) {
    const prefix =
      issue.severity === 'ok' ? '✔' : issue.severity === 'warning' ? '⚠' : '✖'

    console.info(`${prefix} ${issue.code}: ${issue.message}`)
  }

  if (!result.ok) {
    process.exitCode = 1
  }
}

export async function runPackBuildCommand(
  options: PackBuildCommandOptions,
): Promise<void> {
  const result = buildPack({
    cwd: options.cwd,
    packPath: options.packPath,
    outDir: options.out,
    clean: options.noClean !== true,
  })

  console.info('airules pack build')
  console.info(`- pack: ${result.packName}@${result.packVersion}`)
  console.info(`- out: ${result.outDir}`)
  console.info(`- files: ${result.files.length}`)
  console.info(`- hash: ${result.hash}`)
}
