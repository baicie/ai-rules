import type { AirulesLockInstall, MergeStrategy } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { AirulesLockfileSchema } from '@baicie/airules-schema'
import { sha256 } from './hash'
import { readAirulesLockfile } from './lockfile'
import { findManagedBlockRange } from './managed-block'
import { safeResolveTarget } from './path-utils'

export type DoctorSeverity = 'ok' | 'warning' | 'error'

export interface DoctorIssue {
  severity: DoctorSeverity
  code: string
  message: string
  target?: string
  pack?: string
  installId?: string
}

export interface DoctorResult {
  ok: boolean
  issues: DoctorIssue[]
}

export interface RunDoctorOptions {
  cwd: string
}

export function runDoctor(options: RunDoctorOptions): DoctorResult {
  const issues: DoctorIssue[] = []

  let lockfile: ReturnType<typeof readAirulesLockfile>

  try {
    lockfile = readAirulesLockfile(options.cwd)
    AirulesLockfileSchema.parse(lockfile)
    issues.push({
      severity: 'ok',
      code: 'lockfile-valid',
      message: 'Lockfile schema is valid.',
    })
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'lockfile-invalid',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  if (lockfile.installs.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'no-installs',
      message: 'No installed airules entries found in lockfile.',
    })
  }

  for (const install of lockfile.installs) {
    issues.push(...checkInstall(options.cwd, install))
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    issues,
  }
}

function checkInstall(cwd: string, install: AirulesLockInstall): DoctorIssue[] {
  const merge =
    install.merge !== undefined
      ? install.merge
      : defaultMergeForLockInstall(install)
  const files =
    install.files !== undefined && install.files.length > 0
      ? install.files
      : [
          {
            target: install.target,
            contentHash: install.contentHash,
          },
        ]

  const issues: DoctorIssue[] = []

  for (const file of files) {
    const targetPath = safeResolveTarget(cwd, file.target)

    if (!existsSync(targetPath)) {
      issues.push({
        severity: 'error',
        code: 'target-missing',
        message: `Target file is missing: ${file.target}`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })
      continue
    }

    const content = readFileSync(targetPath, 'utf8')

    if (merge === 'managed-block') {
      const range = findManagedBlockRange(content, {
        pack: install.pack,
        install: install.installId,
      })

      if (range === null) {
        issues.push({
          severity: 'error',
          code: 'managed-block-missing',
          message: `Managed block is missing in ${file.target}.`,
          target: file.target,
          pack: install.pack,
          installId: install.installId,
        })
        continue
      }

      issues.push({
        severity: 'ok',
        code: 'managed-block-present',
        message: `Managed block exists in ${file.target}.`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })

      continue
    }

    const currentHash = sha256(content)

    if (currentHash !== file.contentHash) {
      issues.push({
        severity: 'warning',
        code: 'target-modified',
        message: `Target file was modified after install: ${file.target}`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })
      continue
    }

    issues.push({
      severity: 'ok',
      code: 'target-clean',
      message: `Target file matches lock hash: ${file.target}`,
      target: file.target,
      pack: install.pack,
      installId: install.installId,
    })
  }

  return issues
}

function defaultMergeForLockInstall(
  install: AirulesLockInstall,
): MergeStrategy {
  if (install.mode === 'modules' || install.mode === 'template') {
    return 'managed-block'
  }

  return 'overwrite-managed'
}
