import type {
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
  const nextPacks: AirulesLockPack[] = []
  for (const pack of lockfile.packs) {
    if (pack.name !== packEntry.name) {
      nextPacks.push(pack)
    }
  }
  nextPacks.push(packEntry)

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
