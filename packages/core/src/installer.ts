import type {
  AgentName,
  AirulesInstall,
  AirulesLockInstall,
  AirulesLockPack,
  MergeStrategy,
} from '@baicie/airules-schema'
import type { ResolvedPackSource } from './source'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { sha256 } from './hash'
import {
  readAirulesLockfile,
  upsertLockEntries,
  writeAirulesLockfile,
} from './lockfile'
import { createManagedBlock, upsertManagedBlock } from './managed-block'
import { renderModules } from './module-renderer'
import { loadLocalPack } from './pack-loader'
import { selectInstalls } from './profile'
import { resolveLocalPackSource, resolvePackSource } from './source'

export interface InstallPackOptions {
  cwd: string
  source: string
  profile?: string
  agents?: AgentName[]
  dryRun?: boolean
}

export interface InstallOperation {
  pack: string
  installId: string
  agent: AgentName
  target: string
  action: 'create' | 'update' | 'unchanged'
  previousContent: string
  nextContent: string
  renderedContent: string
  managedBlock: string
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
  const installs = selectInstalls(loaded.pack, {
    profile: options.profile,
    agents: options.agents,
  })

  if (installs.length === 0) {
    throw new Error(
      `No installs selected for pack "${loaded.pack.name}". Check --agent or profile config.`,
    )
  }

  const operations: InstallOperation[] = []
  const lockInstallEntries: AirulesLockInstall[] = []
  const dryRun = options.dryRun === true

  for (const install of installs) {
    assertPhase2SupportedInstall(install)

    const rendered = renderModules({
      pack: loaded.pack,
      packRoot: loaded.root,
      install,
    })

    const contentHash = sha256(rendered.content)
    const managedBlock = createManagedBlock(
      {
        pack: loaded.pack.name,
        install: install.id,
        version: loaded.pack.version,
        hash: contentHash,
      },
      rendered.content,
    )

    const targetPath = resolve(options.cwd, install.target)
    const previousContent = existsSync(targetPath)
      ? readFileSync(targetPath, 'utf8')
      : ''

    const placement =
      install.placement !== undefined
        ? install.placement
        : { type: 'append' as const }

    const nextContent = upsertManagedBlock(
      previousContent,
      {
        pack: loaded.pack.name,
        install: install.id,
        version: loaded.pack.version,
        hash: contentHash,
      },
      rendered.content,
      placement,
    )

    const action = getWriteAction(previousContent, nextContent, targetPath)

    operations.push({
      pack: loaded.pack.name,
      installId: install.id,
      agent: install.agent,
      target: install.target,
      action,
      previousContent,
      nextContent,
      renderedContent: rendered.content,
      managedBlock,
      contentHash,
    })

    lockInstallEntries.push({
      pack: loaded.pack.name,
      installId: install.id,
      agent: install.agent,
      target: install.target,
      mode: install.mode,
      merge: install.merge !== undefined ? install.merge : 'managed-block',
      modules: rendered.moduleIds,
      contentHash,
      managedBlockId: `airules:${loaded.pack.name}:${install.id}`,
    })

    if (!dryRun && action !== 'unchanged') {
      mkdirSync(dirname(targetPath), {
        recursive: true,
      })
      writeFileSync(targetPath, nextContent)
    }
  }

  if (!dryRun) {
    const lockfile = readAirulesLockfile(options.cwd)

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

function assertPhase2SupportedInstall(install: AirulesInstall): void {
  if (install.mode !== 'modules') {
    throw new Error(
      `Install "${install.id}" uses mode "${install.mode}". Phase 2 only supports modules mode.`,
    )
  }

  const merge: MergeStrategy =
    install.merge !== undefined ? install.merge : 'managed-block'

  if (merge !== 'managed-block') {
    throw new Error(
      `Install "${install.id}" uses merge "${merge}". Phase 2 only supports managed-block merge.`,
    )
  }
}

function getWriteAction(
  previousContent: string,
  nextContent: string,
  targetPath: string,
): InstallOperation['action'] {
  if (previousContent === nextContent) {
    return 'unchanged'
  }

  if (!existsSync(targetPath)) {
    return 'create'
  }

  return 'update'
}

export function createDryRunBlockForOperation(
  operation: InstallOperation,
): string {
  return operation.managedBlock
}
