import type { AirulesLockInstall, MergeStrategy } from '@baicie/airules-schema'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { sha256 } from './hash'
import {
  readAirulesLockfile,
  removePackFromLockfile,
  writeAirulesLockfile,
} from './lockfile'
import { removeManagedBlock } from './managed-block'
import { ensureParentDirectory, safeResolveTarget } from './path-utils'

export interface RemovePackOptions {
  cwd: string
  pack: string
  dryRun?: boolean
  force?: boolean
}

export type RemoveAction =
  | 'remove-managed-block'
  | 'delete-file'
  | 'skip-missing'
  | 'skip-modified'
  | 'unchanged'

export interface RemoveOperation {
  pack: string
  installId: string
  target: string
  action: RemoveAction
  reason?: string
}

export interface RemovePackResult {
  pack: string
  operations: RemoveOperation[]
}

export function removePack(options: RemovePackOptions): RemovePackResult {
  const lockfile = readAirulesLockfile(options.cwd)
  const installs = lockfile.installs.filter(
    install => install.pack === options.pack,
  )

  if (installs.length === 0) {
    throw new Error(`Pack "${options.pack}" is not installed.`)
  }

  const operations: RemoveOperation[] = []
  const dryRun = options.dryRun === true
  const force = options.force === true

  for (const install of installs) {
    operations.push(
      ...removeInstall({
        cwd: options.cwd,
        install,
        dryRun,
        force,
      }),
    )
  }

  if (!dryRun) {
    writeAirulesLockfile(
      options.cwd,
      removePackFromLockfile(lockfile, options.pack),
    )
  }

  return {
    pack: options.pack,
    operations,
  }
}

function removeInstall(options: {
  cwd: string
  install: AirulesLockInstall
  dryRun: boolean
  force: boolean
}): RemoveOperation[] {
  const merge =
    options.install.merge !== undefined
      ? options.install.merge
      : defaultMergeForLockInstall(options.install)
  const files =
    options.install.files !== undefined && options.install.files.length > 0
      ? options.install.files
      : [
          {
            target: options.install.target,
            contentHash: options.install.contentHash,
          },
        ]

  const operations: RemoveOperation[] = []

  for (const file of files) {
    if (merge === 'managed-block') {
      operations.push(
        removeManagedBlockTarget({
          cwd: options.cwd,
          install: options.install,
          target: file.target,
          dryRun: options.dryRun,
        }),
      )
      continue
    }

    operations.push(
      removeGeneratedFileTarget({
        cwd: options.cwd,
        install: options.install,
        target: file.target,
        expectedHash: file.contentHash,
        dryRun: options.dryRun,
        force: options.force,
      }),
    )
  }

  return operations
}

function removeManagedBlockTarget(options: {
  cwd: string
  install: AirulesLockInstall
  target: string
  dryRun: boolean
}): RemoveOperation {
  const targetPath = safeResolveTarget(options.cwd, options.target)

  if (!existsSync(targetPath)) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'target file does not exist',
    }
  }

  const previousContent = readFileSync(targetPath, 'utf8')
  const nextContent = removeManagedBlock(previousContent, {
    pack: options.install.pack,
    install: options.install.installId,
  })

  if (nextContent === null) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'managed block does not exist',
    }
  }

  if (!options.dryRun) {
    ensureParentDirectory(targetPath)

    if (nextContent.trim().length === 0) {
      rmSync(targetPath, {
        force: true,
      })
    } else {
      writeFileSync(targetPath, nextContent)
    }

    cleanupEmptyParents(dirname(targetPath), options.cwd)
  }

  return {
    pack: options.install.pack,
    installId: options.install.installId,
    target: options.target,
    action: 'remove-managed-block',
  }
}

function removeGeneratedFileTarget(options: {
  cwd: string
  install: AirulesLockInstall
  target: string
  expectedHash: string
  dryRun: boolean
  force: boolean
}): RemoveOperation {
  const targetPath = safeResolveTarget(options.cwd, options.target)

  if (!existsSync(targetPath)) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'target file does not exist',
    }
  }

  const currentContent = readFileSync(targetPath, 'utf8')
  const currentHash = sha256(currentContent)

  if (!options.force && currentHash !== options.expectedHash) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-modified',
      reason: 'target file was modified by user',
    }
  }

  if (!options.dryRun) {
    rmSync(targetPath, {
      force: true,
    })
    cleanupEmptyParents(dirname(targetPath), options.cwd)
  }

  return {
    pack: options.install.pack,
    installId: options.install.installId,
    target: options.target,
    action: 'delete-file',
  }
}

function defaultMergeForLockInstall(
  install: AirulesLockInstall,
): MergeStrategy {
  if (install.mode === 'modules' || install.mode === 'template') {
    return 'managed-block'
  }

  return 'overwrite-managed'
}

function cleanupEmptyParents(startDir: string, root: string): void {
  let current = startDir

  while (current.startsWith(root) && current !== root) {
    try {
      rmSync(current, {
        recursive: false,
      })
      current = dirname(current)
    } catch {
      return
    }
  }
}
