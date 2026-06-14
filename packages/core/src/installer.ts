import type {
  AgentName,
  AirulesInstall,
  AirulesLockfile,
  AirulesLockInstall,
  AirulesLockInstallFile,
  AirulesLockPack,
  InstallMode,
  MergeStrategy,
} from '@baicie/airules-schema'
import type { RenderedInstallFile } from './install-renderer'
import type { ResolvedPackSource } from './source'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { sha256 } from './hash'
import { renderInstall } from './install-renderer'
import {
  readAirulesLockfile,
  upsertLockEntries,
  writeAirulesLockfile,
} from './lockfile'
import { createManagedBlock, upsertManagedBlock } from './managed-block'
import { loadLocalPack } from './pack-loader'
import {
  ensureParentDirectory,
  getManualStagedPath,
  safeResolveTarget,
} from './path-utils'
import { resolveProfile, selectInstalls } from './profile'
import { resolveLocalPackSource, resolvePackSource } from './source'

export interface InstallPackOptions {
  cwd: string
  source: string
  profile?: string
  agents?: AgentName[]
  variables?: Record<string, unknown>
  dryRun?: boolean
}

export type InstallOperationAction =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'skipped'
  | 'stage'

export interface InstallOperation {
  pack: string
  installId: string
  agent: AgentName
  mode: InstallMode
  merge: MergeStrategy
  target: string
  writeTarget: string
  action: InstallOperationAction
  previousContent: string
  nextContent: string
  renderedContent: string
  managedBlock?: string
  contentHash: string
}

export interface InstallPackResult {
  packName: string
  packVersion: string
  source: string
  operations: InstallOperation[]
}

export async function installPack(
  options: InstallPackOptions,
): Promise<InstallPackResult> {
  const resolvedSource = await resolvePackSource(options.source, options.cwd)
  return installResolvedPack(options, resolvedSource)
}

export function installLocalPack(
  options: InstallPackOptions,
): InstallPackResult {
  const resolvedSource = resolveLocalPackSource(options.source, options.cwd)
  return installResolvedPack(options, resolvedSource)
}

function installResolvedPack(
  options: InstallPackOptions,
  resolvedSource: ResolvedPackSource,
): InstallPackResult {
  const loaded = loadLocalPack(resolvedSource)
  const profileName =
    options.profile !== undefined ? options.profile : 'default'
  const profile = resolveProfile(loaded.pack, profileName)
  const variables = {
    ...profile.variables,
    ...(options.variables !== undefined ? options.variables : {}),
  }

  const installs = selectInstalls(loaded.pack, {
    profile: options.profile,
    agents: options.agents,
  })

  if (installs.length === 0) {
    throw new Error(
      `No installs selected for pack "${loaded.pack.name}". Check --agent or profile config.`,
    )
  }

  const lockfile = readAirulesLockfile(options.cwd)
  const operations: InstallOperation[] = []
  const lockInstallEntries: AirulesLockInstall[] = []
  const dryRun = options.dryRun === true

  for (const install of installs) {
    const rendered = renderInstall({
      pack: loaded.pack,
      packRoot: loaded.root,
      install,
      variables,
    })

    const merge = resolveMergeStrategy(install)

    const installOperations: InstallOperation[] = []
    const lockFiles: AirulesLockInstallFile[] = []

    for (const renderedFile of rendered.files) {
      const operation = applyRenderedFile({
        cwd: options.cwd,
        packName: loaded.pack.name,
        packVersion: loaded.pack.version,
        install,
        renderedFile,
        merge,
        lockfile,
        dryRun,
      })

      installOperations.push(operation)

      if (shouldLockOperation(operation)) {
        lockFiles.push({
          target: renderedFile.target,
          contentHash: operation.contentHash,
        })
      }
    }

    operations.push(...installOperations)

    if (lockFiles.length === 0) {
      continue
    }

    const lockEntry: AirulesLockInstall = {
      pack: loaded.pack.name,
      installId: install.id,
      agent: install.agent,
      target: install.target,
      mode: install.mode,
      merge,
      files: lockFiles,
      contentHash: rendered.contentHash,
      managedBlockId: `airules:${loaded.pack.name}:${install.id}`,
    }

    if (rendered.modules !== undefined) {
      lockEntry.modules = rendered.modules
    }
    if (rendered.blocks !== undefined) {
      lockEntry.blocks = rendered.blocks
    }

    lockInstallEntries.push(lockEntry)
  }

  if (!dryRun) {
    const packEntry: AirulesLockPack = {
      name: loaded.pack.name,
      version: loaded.pack.version,
      source: options.source,
      resolved: resolvedSource.resolved,
      hash: sha256(loaded.rawContent),
    }

    if (options.profile) {
      packEntry.profile = options.profile
    }

    if (options.agents && options.agents.length > 0) {
      packEntry.agents = options.agents
    }

    const nextLockfile = upsertLockEntries(
      lockfile,
      packEntry,
      lockInstallEntries,
    )

    writeAirulesLockfile(options.cwd, nextLockfile)
  }

  return {
    packName: loaded.pack.name,
    packVersion: loaded.pack.version,
    source: options.source,
    operations,
  }
}

interface ApplyRenderedFileOptions {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}

function applyRenderedFile(
  options: ApplyRenderedFileOptions,
): InstallOperation {
  switch (options.merge) {
    case 'managed-block':
      return applyManagedBlockFile(options)

    case 'overwrite-managed':
      return applyOverwriteManagedFile(options)

    case 'skip-if-exists':
      return applySkipIfExistsFile(options)

    case 'manual':
      return applyManualFile(options)

    default: {
      const neverMerge: never = options.merge
      throw new Error(`Unsupported merge strategy: ${String(neverMerge)}`)
    }
  }
}

function applyManagedBlockFile(
  options: ApplyRenderedFileOptions,
): InstallOperation {
  const targetPath = safeResolveTarget(options.cwd, options.renderedFile.target)
  const previousContent = existsSync(targetPath)
    ? readFileSync(targetPath, 'utf8')
    : ''

  const managedBlock = createManagedBlock(
    {
      pack: options.packName,
      install: options.install.id,
      version: options.packVersion,
      hash: options.renderedFile.contentHash,
    },
    options.renderedFile.content,
  )

  const placement =
    options.install.placement !== undefined
      ? options.install.placement
      : { type: 'append' as const }

  const nextContent = upsertManagedBlock(
    previousContent,
    {
      pack: options.packName,
      install: options.install.id,
      version: options.packVersion,
      hash: options.renderedFile.contentHash,
    },
    options.renderedFile.content,
    placement,
  )

  const action = resolveFileAction(previousContent, nextContent, targetPath)

  if (!options.dryRun && action !== 'unchanged') {
    ensureParentDirectory(targetPath)
    writeFileSync(targetPath, nextContent)
  }

  return {
    pack: options.packName,
    installId: options.install.id,
    agent: options.install.agent,
    mode: options.install.mode,
    merge: options.merge,
    target: options.renderedFile.target,
    writeTarget: options.renderedFile.target,
    action,
    previousContent,
    nextContent,
    renderedContent: options.renderedFile.content,
    managedBlock,
    contentHash: options.renderedFile.contentHash,
  }
}

function applyOverwriteManagedFile(
  options: ApplyRenderedFileOptions,
): InstallOperation {
  const targetPath = safeResolveTarget(options.cwd, options.renderedFile.target)
  const previousContent = existsSync(targetPath)
    ? readFileSync(targetPath, 'utf8')
    : ''

  const nextContent = options.renderedFile.content
  const action = resolveFileAction(previousContent, nextContent, targetPath)

  if (
    action === 'update' &&
    !isFileManagedByLock({
      lockfile: options.lockfile,
      packName: options.packName,
      installId: options.install.id,
      target: options.renderedFile.target,
      previousContent,
    })
  ) {
    throw new Error(
      `Refusing to overwrite unmanaged file "${options.renderedFile.target}". Use merge "manual" or remove the file first.`,
    )
  }

  if (!options.dryRun && action !== 'unchanged') {
    ensureParentDirectory(targetPath)
    writeFileSync(targetPath, nextContent)
  }

  return {
    pack: options.packName,
    installId: options.install.id,
    agent: options.install.agent,
    mode: options.install.mode,
    merge: options.merge,
    target: options.renderedFile.target,
    writeTarget: options.renderedFile.target,
    action,
    previousContent,
    nextContent,
    renderedContent: options.renderedFile.content,
    contentHash: sha256(nextContent),
  }
}

function applySkipIfExistsFile(
  options: ApplyRenderedFileOptions,
): InstallOperation {
  const targetPath = safeResolveTarget(options.cwd, options.renderedFile.target)
  const previousContent = existsSync(targetPath)
    ? readFileSync(targetPath, 'utf8')
    : ''

  if (existsSync(targetPath)) {
    return {
      pack: options.packName,
      installId: options.install.id,
      agent: options.install.agent,
      mode: options.install.mode,
      merge: options.merge,
      target: options.renderedFile.target,
      writeTarget: options.renderedFile.target,
      action: 'skipped',
      previousContent,
      nextContent: previousContent,
      renderedContent: options.renderedFile.content,
      contentHash: sha256(previousContent),
    }
  }

  if (!options.dryRun) {
    ensureParentDirectory(targetPath)
    writeFileSync(targetPath, options.renderedFile.content)
  }

  return {
    pack: options.packName,
    installId: options.install.id,
    agent: options.install.agent,
    mode: options.install.mode,
    merge: options.merge,
    target: options.renderedFile.target,
    writeTarget: options.renderedFile.target,
    action: 'create',
    previousContent,
    nextContent: options.renderedFile.content,
    renderedContent: options.renderedFile.content,
    contentHash: sha256(options.renderedFile.content),
  }
}

function applyManualFile(options: ApplyRenderedFileOptions): InstallOperation {
  const stagedPath = getManualStagedPath({
    cwd: options.cwd,
    pack: options.packName,
    installId: options.install.id,
    target: options.renderedFile.target,
  })

  const previousContent = existsSync(stagedPath)
    ? readFileSync(stagedPath, 'utf8')
    : ''

  const nextContent = options.renderedFile.content

  if (!options.dryRun) {
    ensureParentDirectory(stagedPath)
    writeFileSync(stagedPath, nextContent)
  }

  return {
    pack: options.packName,
    installId: options.install.id,
    agent: options.install.agent,
    mode: options.install.mode,
    merge: options.merge,
    target: options.renderedFile.target,
    writeTarget: stagedPath,
    action: 'stage',
    previousContent,
    nextContent,
    renderedContent: options.renderedFile.content,
    contentHash: sha256(nextContent),
  }
}

function resolveMergeStrategy(install: AirulesInstall): MergeStrategy {
  if (install.merge !== undefined) {
    return install.merge
  }

  if (install.mode === 'modules' || install.mode === 'template') {
    return 'managed-block'
  }

  return 'overwrite-managed'
}

function resolveFileAction(
  previousContent: string,
  nextContent: string,
  targetPath: string,
): InstallOperationAction {
  if (previousContent === nextContent) {
    return 'unchanged'
  }

  if (!existsSync(targetPath)) {
    return 'create'
  }

  return 'update'
}

function isFileManagedByLock(options: {
  lockfile: AirulesLockfile
  packName: string
  installId: string
  target: string
  previousContent: string
}): boolean {
  const previousHash = sha256(options.previousContent)

  for (const install of options.lockfile.installs) {
    if (
      install.pack !== options.packName ||
      install.installId !== options.installId
    ) {
      continue
    }

    for (const file of install.files ?? []) {
      if (file.target === options.target && file.contentHash === previousHash) {
        return true
      }
    }
  }

  return false
}

function shouldLockOperation(operation: InstallOperation): boolean {
  return (
    operation.action === 'create' ||
    operation.action === 'update' ||
    operation.action === 'unchanged'
  )
}

export function createDryRunBlockForOperation(
  operation: InstallOperation,
): string {
  return operation.managedBlock ?? operation.nextContent
}
