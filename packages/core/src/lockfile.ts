import type {
  AgentName,
  AirulesLockfile,
  AirulesLockInstall,
  AirulesLockPack,
} from '@baicie/airules-schema'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { AirulesLockfileSchema } from '@baicie/airules-schema'
import { getAirulesLockPath } from './config-loader'

export function createEmptyLockfile(airulesVersion = '0.0.0'): AirulesLockfile {
  return {
    lockfileVersion: 1,
    generatedAt: new Date().toISOString(),
    airulesVersion,
    packs: [],
    installs: [],
  }
}

export function readAirulesLockfile(cwd = process.cwd()): AirulesLockfile {
  const lockPath = getAirulesLockPath(cwd)

  if (!existsSync(lockPath)) {
    return createEmptyLockfile()
  }

  const raw = JSON.parse(readFileSync(lockPath, 'utf8'))
  return AirulesLockfileSchema.parse(raw)
}

export function writeAirulesLockfile(
  cwd: string,
  lockfile: AirulesLockfile,
): void {
  const lockPath = getAirulesLockPath(cwd)
  mkdirSync(dirname(lockPath), {
    recursive: true,
  })

  writeFileSync(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`)
}

export function upsertLockEntries(
  lockfile: AirulesLockfile,
  packEntry: AirulesLockPack,
  installEntries: AirulesLockInstall[],
): AirulesLockfile {
  const previousPack = lockfile.packs.find(pack => pack.name === packEntry.name)
  const mergedPack = mergeLockPackEntry(previousPack, packEntry)

  const nextPacks: AirulesLockPack[] = []
  for (const pack of lockfile.packs) {
    if (pack.name !== packEntry.name) {
      nextPacks.push(pack)
    }
  }
  nextPacks.push(mergedPack)

  const selectedInstallIds = new Set(
    installEntries.map(install => `${install.pack}:${install.installId}`),
  )

  const nextInstalls: AirulesLockInstall[] = []
  for (const install of lockfile.installs) {
    const key = `${install.pack}:${install.installId}`
    if (!selectedInstallIds.has(key)) {
      nextInstalls.push(install)
    }
  }

  for (const install of installEntries) {
    nextInstalls.push(install)
  }

  return {
    lockfileVersion: lockfile.lockfileVersion,
    airulesVersion: lockfile.airulesVersion,
    generatedAt: new Date().toISOString(),
    packs: nextPacks,
    installs: nextInstalls,
  }
}

export function removePackFromLockfile(
  lockfile: AirulesLockfile,
  packName: string,
): AirulesLockfile {
  return {
    ...lockfile,
    generatedAt: new Date().toISOString(),
    packs: lockfile.packs.filter(pack => pack.name !== packName),
    installs: lockfile.installs.filter(install => install.pack !== packName),
  }
}

export function pruneLockfile(
  lockfile: AirulesLockfile,
  predicate: (install: AirulesLockInstall) => boolean,
): AirulesLockfile {
  const installs = lockfile.installs.filter(predicate)
  const packNames = new Set(installs.map(install => install.pack))

  return {
    ...lockfile,
    generatedAt: new Date().toISOString(),
    installs,
    packs: lockfile.packs.filter(pack => packNames.has(pack.name)),
  }
}

function mergeLockPackEntry(
  previous: AirulesLockPack | undefined,
  incoming: AirulesLockPack,
): AirulesLockPack {
  const mergedAgents = mergeAgents(previous?.agents, incoming.agents)

  const result: AirulesLockPack = {
    name: incoming.name,
    version: incoming.version,
    source: incoming.source,
    resolved: incoming.resolved,
    hash: incoming.hash,
  }

  if (incoming.profile !== undefined) {
    result.profile = incoming.profile
  } else if (previous?.profile !== undefined) {
    result.profile = previous.profile
  }

  if (mergedAgents !== undefined) {
    result.agents = mergedAgents
  }

  return result
}

function mergeAgents(
  previous: AgentName[] | undefined,
  incoming: AgentName[] | undefined,
): AgentName[] | undefined {
  if (!previous && !incoming) {
    return undefined
  }

  const agents = new Set<AgentName>()

  for (const agent of previous ?? []) {
    agents.add(agent)
  }

  for (const agent of incoming ?? []) {
    agents.add(agent)
  }

  return Array.from(agents)
}
