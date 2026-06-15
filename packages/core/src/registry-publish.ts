import type {
  AirulesRegistry,
  AirulesRegistryPack,
} from '@baicie/airules-schema'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { AirulesRegistrySchema } from '@baicie/airules-schema'
import { loadLocalPack } from './pack-loader'
import { assertPackValid } from './pack-validator'
import { ensureParentDirectory } from './path-utils'
import { resolveLocalPackSource } from './source'

export interface PublishPackToRegistryOptions {
  cwd?: string
  packPath: string
  registryPath: string
  source: string
  aliases?: string[]
  tags?: string[]
  description?: string
  homepage?: string
  deprecated?: boolean | string
  makeDefault?: boolean
}

export interface PublishPackToRegistryResult {
  registryPath: string
  pack: AirulesRegistryPack
  action: 'create-registry' | 'add-pack' | 'update-pack'
}

export function publishPackToRegistry(
  options: PublishPackToRegistryOptions,
): PublishPackToRegistryResult {
  const cwd = options.cwd ?? process.cwd()

  assertPackValid({
    cwd,
    packPath: options.packPath,
  })

  const loaded = loadLocalPack(resolveLocalPackSource(options.packPath, cwd))
  const registryPath = isAbsolute(options.registryPath)
    ? options.registryPath
    : resolve(cwd, options.registryPath)

  const { registry, existed } = readOrCreateRegistry(registryPath)

  const packEntry: AirulesRegistryPack = {
    name: loaded.pack.name,
    source: options.source,
    version: loaded.pack.version,
  }

  const description = options.description ?? loaded.pack.description
  if (description !== undefined) {
    packEntry.description = description
  }

  const tags = options.tags ?? loaded.pack.keywords
  if (tags !== undefined && tags.length > 0) {
    packEntry.tags = dedupe(tags)
  }

  if (options.aliases !== undefined && options.aliases.length > 0) {
    packEntry.aliases = dedupe(options.aliases)
  }

  if (options.homepage !== undefined) {
    packEntry.homepage = options.homepage
  }

  if (options.deprecated !== undefined) {
    packEntry.deprecated = options.deprecated
  }

  const previousIndex = registry.packs.findIndex(
    pack => pack.name === packEntry.name,
  )
  const action: PublishPackToRegistryResult['action'] = !existed
    ? 'create-registry'
    : previousIndex === -1
      ? 'add-pack'
      : 'update-pack'

  if (previousIndex === -1) {
    registry.packs.push(packEntry)
  } else {
    registry.packs[previousIndex] = {
      ...registry.packs[previousIndex],
      ...packEntry,
    }
  }

  if (options.makeDefault === true || !existed) {
    registry.defaultPack = packEntry.name
  }

  registry.packs.sort((a, b) => a.name.localeCompare(b.name))

  ensureParentDirectory(registryPath)
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

  return {
    registryPath,
    pack: packEntry,
    action,
  }
}

function readOrCreateRegistry(registryPath: string): {
  registry: AirulesRegistry
  existed: boolean
} {
  if (!existsSync(registryPath)) {
    return {
      existed: false,
      registry: {
        packs: [],
      },
    }
  }

  const raw = JSON.parse(readFileSync(registryPath, 'utf8'))
  return {
    existed: true,
    registry: AirulesRegistrySchema.parse(raw),
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}
