import {
  createPackScaffold,
  createRegistryScaffold,
  createSkillScaffold,
} from '@baicie/airules-core'

export interface CreatePackCommandOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateSkillCommandOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateRegistryCommandOptions {
  cwd: string
  force?: boolean
}

export async function runCreatePackCommand(
  options: CreatePackCommandOptions,
): Promise<void> {
  const result = createPackScaffold({
    cwd: options.cwd,
    name: options.name,
    force: options.force === true,
  })

  console.info('airules create pack')
  printFiles(result.files)
}

export async function runCreateSkillCommand(
  options: CreateSkillCommandOptions,
): Promise<void> {
  const result = createSkillScaffold({
    cwd: options.cwd,
    name: options.name,
    force: options.force === true,
  })

  console.info('airules create skill')
  printFiles(result.files)
}

export async function runCreateRegistryCommand(
  options: CreateRegistryCommandOptions,
): Promise<void> {
  const result = createRegistryScaffold({
    cwd: options.cwd,
    force: options.force === true,
  })

  console.info('airules create registry')
  printFiles(result.files)
}

function printFiles(files: string[]): void {
  if (files.length === 0) {
    console.info('- no files changed')
    return
  }

  for (const file of files) {
    console.info(`- created: ${file}`)
  }
}
