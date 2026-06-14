import { existsSync } from 'node:fs'
import {
  pruneLockfile,
  readAirulesLockfile,
  writeAirulesLockfile,
} from './lockfile'
import { findManagedBlockRange } from './managed-block'
import { readTextFile, safeResolveTarget } from './path-utils'

export interface PruneOptions {
  cwd: string
  dryRun?: boolean
}

export interface PruneOperation {
  pack: string
  installId: string
  action: 'keep' | 'prune'
  reason: string
}

export interface PruneResult {
  operations: PruneOperation[]
}

interface PruneInstallInput {
  pack: string
  installId: string
  target: string
  merge?: string
  mode: string
  files?: Array<{ target: string; contentHash: string }>
}

export function pruneAirules(options: PruneOptions): PruneResult {
  const lockfile = readAirulesLockfile(options.cwd)
  const operations: PruneOperation[] = []

  const nextLockfile = pruneLockfile(lockfile, install => {
    const keep = shouldKeepInstall(options.cwd, install)
    operations.push({
      pack: install.pack,
      installId: install.installId,
      action: keep.keep ? 'keep' : 'prune',
      reason: keep.reason,
    })
    return keep.keep
  })

  if (options.dryRun !== true) {
    writeAirulesLockfile(options.cwd, nextLockfile)
  }

  return {
    operations,
  }
}

function shouldKeepInstall(
  cwd: string,
  install: PruneInstallInput,
): { keep: boolean; reason: string } {
  const merge =
    install.merge ??
    (install.mode === 'modules' || install.mode === 'template'
      ? 'managed-block'
      : 'overwrite-managed')

  const files =
    install.files !== undefined && install.files.length > 0
      ? install.files
      : [
          {
            target: install.target,
            contentHash: '',
          },
        ]

  for (const file of files) {
    const targetPath = safeResolveTarget(cwd, file.target)

    if (!existsSync(targetPath)) {
      continue
    }

    if (merge === 'managed-block') {
      const content = readTextFile(targetPath)
      const range = findManagedBlockRange(content, {
        pack: install.pack,
        install: install.installId,
      })

      if (range !== null) {
        return {
          keep: true,
          reason: 'managed block exists',
        }
      }

      continue
    }

    return {
      keep: true,
      reason: 'target file exists',
    }
  }

  return {
    keep: false,
    reason: 'all targets are missing or managed block is missing',
  }
}
