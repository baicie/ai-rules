import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { existsSync, statSync } from 'node:fs'
import process from 'node:process'
import { AirulesPackSchema } from '@baicie/airules-schema'
import { loadLocalPack } from './pack-loader'
import { safeResolveInside } from './path-utils'
import { resolveLocalPackSource } from './source'

export type PackValidationSeverity = 'error' | 'warning' | 'ok'

export interface PackValidationIssue {
  severity: PackValidationSeverity
  code: string
  message: string
  installId?: string
  path?: string
}

export interface ValidatePackOptions {
  cwd?: string
  packPath: string
}

export interface ValidatePackResult {
  ok: boolean
  packName?: string
  packVersion?: string
  issues: PackValidationIssue[]
}

export function validatePack(options: ValidatePackOptions): ValidatePackResult {
  const cwd = options.cwd ?? process.cwd()
  const issues: PackValidationIssue[] = []

  let loaded: ReturnType<typeof loadLocalPack>

  try {
    loaded = loadLocalPack(resolveLocalPackSource(options.packPath, cwd))
    AirulesPackSchema.parse(loaded.pack)
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'pack-invalid',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  issues.push({
    severity: 'ok',
    code: 'pack-schema-valid',
    message: 'airules.pack.json schema is valid.',
  })

  const duplicatedInstallIds = findDuplicateInstallIds(loaded.pack.installs)
  for (const installId of duplicatedInstallIds) {
    issues.push({
      severity: 'error',
      code: 'duplicate-install-id',
      message: `Duplicate install id "${installId}".`,
      installId,
    })
  }

  for (const install of loaded.pack.installs) {
    issues.push(
      ...validateInstall({
        pack: loaded.pack,
        packRoot: loaded.root,
        install,
      }),
    )
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    packName: loaded.pack.name,
    packVersion: loaded.pack.version,
    issues,
  }
}

export function assertPackValid(options: ValidatePackOptions): void {
  const result = validatePack(options)

  if (!result.ok) {
    const message = result.issues
      .filter(issue => issue.severity === 'error')
      .map(issue => `${issue.code}: ${issue.message}`)
      .join('\n')

    throw new Error(message || 'Pack validation failed.')
  }
}

function validateInstall(options: {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
}): PackValidationIssue[] {
  const issues: PackValidationIssue[] = []
  const install = options.install

  if (install.mode === 'modules') {
    const modules = options.pack.modules

    if (modules === undefined) {
      issues.push({
        severity: 'error',
        code: 'modules-missing',
        message: `Install "${install.id}" uses modules mode but pack.modules is missing.`,
        installId: install.id,
      })
      return issues
    }

    for (const moduleId of install.concat ?? []) {
      const modulePath = modules[moduleId]

      if (modulePath === undefined) {
        issues.push({
          severity: 'error',
          code: 'module-id-missing',
          message: `Install "${install.id}" references missing module "${moduleId}".`,
          installId: install.id,
        })
        continue
      }

      issues.push(
        validateFileExists(options.packRoot, modulePath, {
          code: 'module-file-missing',
          installId: install.id,
          label: `module "${moduleId}"`,
        }),
      )
    }

    return issues
  }

  if (install.mode === 'template') {
    if (install.template !== undefined) {
      issues.push(
        validateFileExists(options.packRoot, install.template, {
          code: 'template-file-missing',
          installId: install.id,
          label: 'template',
        }),
      )
    }

    for (const blockId of install.blocks ?? []) {
      const blockPath = options.pack.blocks?.[blockId]

      if (blockPath === undefined) {
        issues.push({
          severity: 'error',
          code: 'block-id-missing',
          message: `Install "${install.id}" references missing block "${blockId}".`,
          installId: install.id,
        })
        continue
      }

      issues.push(
        validateFileExists(options.packRoot, blockPath, {
          code: 'block-file-missing',
          installId: install.id,
          label: `block "${blockId}"`,
        }),
      )
    }

    return issues
  }

  if (install.mode === 'file') {
    if (install.from !== undefined) {
      issues.push(
        validateFileExists(options.packRoot, install.from, {
          code: 'source-file-missing',
          installId: install.id,
          label: 'file source',
        }),
      )
    }

    return issues
  }

  if (install.mode === 'directory') {
    if (install.from !== undefined) {
      issues.push(
        validateDirectoryExists(options.packRoot, install.from, {
          code: 'source-directory-missing',
          installId: install.id,
          label: 'directory source',
        }),
      )
    }

    return issues
  }

  return issues
}

function validateFileExists(
  packRoot: string,
  relativePath: string,
  options: {
    code: string
    installId: string
    label: string
  },
): PackValidationIssue {
  try {
    const absolutePath = safeResolveInside(
      packRoot,
      relativePath,
      options.label,
    )

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return {
        severity: 'error',
        code: options.code,
        message: `${options.label} does not exist: ${relativePath}`,
        installId: options.installId,
        path: relativePath,
      }
    }

    return {
      severity: 'ok',
      code: 'file-exists',
      message: `${options.label} exists: ${relativePath}`,
      installId: options.installId,
      path: relativePath,
    }
  } catch (error) {
    return {
      severity: 'error',
      code: options.code,
      message: error instanceof Error ? error.message : String(error),
      installId: options.installId,
      path: relativePath,
    }
  }
}

function validateDirectoryExists(
  packRoot: string,
  relativePath: string,
  options: {
    code: string
    installId: string
    label: string
  },
): PackValidationIssue {
  try {
    const absolutePath = safeResolveInside(
      packRoot,
      relativePath,
      options.label,
    )

    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      return {
        severity: 'error',
        code: options.code,
        message: `${options.label} does not exist: ${relativePath}`,
        installId: options.installId,
        path: relativePath,
      }
    }

    return {
      severity: 'ok',
      code: 'directory-exists',
      message: `${options.label} exists: ${relativePath}`,
      installId: options.installId,
      path: relativePath,
    }
  } catch (error) {
    return {
      severity: 'error',
      code: options.code,
      message: error instanceof Error ? error.message : String(error),
      installId: options.installId,
      path: relativePath,
    }
  }
}

function findDuplicateInstallIds(installs: AirulesInstall[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const install of installs) {
    if (seen.has(install.id)) {
      duplicates.add(install.id)
    }

    seen.add(install.id)
  }

  return Array.from(duplicates)
}
