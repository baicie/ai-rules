import type {
  AirulesConfig,
  AirulesRegistry,
  AirulesRegistryPack,
  AirulesRegistryRef,
} from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { AirulesRegistrySchema } from '@baicie/airules-schema'
import { parseGitHubSource } from './github-source'
import {
  isDirectPackSourceInput,
  normalizePackSourceInput,
} from './source-spec'

export const DEFAULT_REGISTRY_SOURCE =
  'github:baicie/ai-rules/registry.json#main'

export interface LoadedRegistry {
  ref: AirulesRegistryRef
  registry: AirulesRegistry
}

export interface ResolvePackAliasOptions {
  cwd: string
  source: string
  config?: AirulesConfig
  registrySource?: string
}

export interface ResolvedPackAlias {
  input: string
  name?: string
  source: string
  registry?: string
  entry?: AirulesRegistryPack
}

export interface SearchRegistryOptions {
  cwd: string
  query?: string
  config?: AirulesConfig
  registrySource?: string
}

export interface SearchRegistryResult {
  registry: string
  pack: AirulesRegistryPack
}

export function isDirectPackSource(source: string): boolean {
  return isDirectPackSourceInput(source)
}

export async function resolvePackAlias(
  options: ResolvePackAliasOptions,
): Promise<ResolvedPackAlias> {
  if (isDirectPackSource(options.source)) {
    return {
      input: options.source,
      source: normalizePackSourceInput(options.source),
    }
  }

  const registries = await loadConfiguredRegistries({
    cwd: options.cwd,
    config: options.config,
    registrySource: options.registrySource,
  })

  const matches: Array<{
    registry: LoadedRegistry
    pack: AirulesRegistryPack
  }> = []

  for (const registry of registries) {
    for (const pack of registry.registry.packs) {
      if (matchesPackAlias(pack, options.source)) {
        matches.push({
          registry,
          pack,
        })
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `Cannot resolve airules pack "${options.source}" from configured registries.`,
    )
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous airules pack "${options.source}". Matched: ${matches
        .map(match => `${match.pack.name} from ${match.registry.ref.source}`)
        .join(', ')}`,
    )
  }

  const match = matches[0]!

  return {
    input: options.source,
    name: match.pack.name,
    source: match.pack.source,
    registry: match.registry.ref.source,
    entry: match.pack,
  }
}

export async function searchRegistries(
  options: SearchRegistryOptions,
): Promise<SearchRegistryResult[]> {
  const registries = await loadConfiguredRegistries({
    cwd: options.cwd,
    config: options.config,
    registrySource: options.registrySource,
  })

  const query = options.query?.trim().toLowerCase()
  const results: SearchRegistryResult[] = []

  for (const registry of registries) {
    for (const pack of registry.registry.packs) {
      if (!query || matchesSearchQuery(pack, query)) {
        results.push({
          registry: registry.ref.source,
          pack,
        })
      }
    }
  }

  results.sort((a, b) => a.pack.name.localeCompare(b.pack.name))
  return results
}

export async function loadConfiguredRegistries(options: {
  cwd: string
  config?: AirulesConfig
  registrySource?: string
}): Promise<LoadedRegistry[]> {
  const refs = resolveRegistryRefs(options.config, options.registrySource)
  const registries: LoadedRegistry[] = []

  for (const ref of refs) {
    registries.push({
      ref,
      registry: await loadRegistry({
        cwd: options.cwd,
        source: ref.source,
      }),
    })
  }

  return registries
}

export function resolveRegistryRefs(
  config: AirulesConfig | undefined,
  registrySource: string | undefined,
): AirulesRegistryRef[] {
  if (registrySource !== undefined && registrySource.length > 0) {
    return [
      {
        source: registrySource,
      },
    ]
  }

  if (config?.registries !== undefined && config.registries.length > 0) {
    return config.registries
  }

  return [
    {
      name: 'default',
      source: DEFAULT_REGISTRY_SOURCE,
    },
  ]
}

export async function loadRegistry(options: {
  cwd: string
  source: string
}): Promise<AirulesRegistry> {
  const raw = await readRegistrySource(options.cwd, options.source)
  const parsed = JSON.parse(raw)
  return AirulesRegistrySchema.parse(parsed)
}

async function readRegistrySource(
  cwd: string,
  source: string,
): Promise<string> {
  if (source.startsWith('github:')) {
    return readGitHubRegistry(source)
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    return readHttpRegistry(source)
  }

  const localSource = source.startsWith('local:')
    ? source.slice('local:'.length)
    : source

  if (localSource.startsWith('file://')) {
    return readFileSync(new URL(localSource), 'utf8')
  }

  const absolutePath = isAbsolute(localSource)
    ? localSource
    : resolve(cwd, localSource)

  if (!existsSync(absolutePath)) {
    throw new Error(`Registry file does not exist: ${absolutePath}`)
  }

  return readFileSync(absolutePath, 'utf8')
}

async function readGitHubRegistry(source: string): Promise<string> {
  const parsed = parseGitHubSource(source)
  const ref = parsed.ref ?? 'main'

  if (!parsed.path) {
    throw new Error(
      `GitHub registry source "${source}" must point to a registry json file.`,
    )
  }

  const url = `https://raw.githubusercontent.com/${encodeURIComponent(
    parsed.owner,
  )}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(ref)}/${parsed.path}`

  return readHttpRegistry(url)
}

async function readHttpRegistry(source: string): Promise<string> {
  const response = await fetch(source, {
    headers: createRegistryHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Registry request failed: ${response.status} ${response.statusText} ${source}${body ? `\n${body}` : ''}`,
    )
  }

  return response.text()
}

function createRegistryHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'airules',
  }

  const token =
    process.env.GITHUB_TOKEN !== undefined &&
    process.env.GITHUB_TOKEN.length > 0
      ? process.env.GITHUB_TOKEN
      : process.env.GH_TOKEN

  if (token !== undefined && token.length > 0) {
    headers.authorization = `Bearer ${token}`
  }

  return headers
}

function matchesPackAlias(pack: AirulesRegistryPack, input: string): boolean {
  if (pack.name === input) {
    return true
  }

  for (const alias of pack.aliases ?? []) {
    if (alias === input) {
      return true
    }
  }

  return false
}

function matchesSearchQuery(pack: AirulesRegistryPack, query: string): boolean {
  const haystack = [
    pack.name,
    pack.description ?? '',
    pack.version ?? '',
    ...(pack.tags ?? []),
    ...(pack.aliases ?? []),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}
