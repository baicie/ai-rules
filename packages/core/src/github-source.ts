import type {
  AirulesRegistry,
  AirulesRegistryPack,
  AirulesResolvedSource,
} from '@baicie/airules-schema'
import { Buffer } from 'node:buffer'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { AirulesRegistrySchema } from '@baicie/airules-schema'
import { getAirulesPackCacheDir } from './cache-path'
import { sha256 } from './hash'

export interface ParsedGitHubSource {
  owner: string
  repo: string
  path: string
  ref?: string
}

export interface ResolvedGitHubPackSource {
  source: string
  root: string
  resolved: Extract<AirulesResolvedSource, { type: 'github' }>
}

interface GitHubRepoResponse {
  default_branch?: string
}

interface GitHubCommitResponse {
  sha: string
  commit?: {
    tree?: {
      sha?: string
    }
  }
}

interface GitHubTreeResponse {
  truncated?: boolean
  tree?: GitHubTreeEntry[]
}

interface GitHubTreeEntry {
  path?: string
  mode?: string
  type?: string
  sha?: string
  size?: number
  url?: string
}

interface GitHubBlobResponse {
  content?: string
  encoding?: string
  sha?: string
}

interface DiscoveredGitHubPackRoot {
  root: string
  path: string
}

interface GitHubCommitMarker {
  owner: string
  repo: string
  ref: string
  treeSha: string
  subPaths: string
  stripMode: string
  entryFilterName: string
}

interface GitHubCacheHit {
  root: string
  ref: string
  commit: string
  treeSha: string
  mtimeMs: number
}

export async function resolveGitHubPackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedGitHubPackSource> {
  const parsed = parseGitHubSource(source)
  const cached = resolveGitHubPackSourceFromCache({
    parsed,
    source,
    cwd,
  })

  if (cached !== null) {
    return cached
  }

  const ref =
    parsed.ref !== undefined ? parsed.ref : await fetchDefaultBranch(parsed)
  const commit = await fetchGitHubCommit(parsed, ref)
  const treeSha = commit.commit && commit.commit.tree && commit.commit.tree.sha

  if (!treeSha) {
    throw new Error(
      `Cannot resolve tree sha for GitHub source "${source}" at ref "${ref}".`,
    )
  }

  if (parsed.path.length > 0) {
    const cacheRoot = getGitHubPackCacheRoot(cwd, {
      owner: parsed.owner,
      repo: parsed.repo,
      commit: commit.sha,
      path: parsed.path,
    })

    await downloadGitHubSubTreeToCache({
      parsed,
      ref,
      treeSha,
      cacheRoot,
      subPaths: [parsed.path],
      stripPrefix: true,
    })

    return {
      source,
      root: cacheRoot,
      resolved: {
        type: 'github',
        owner: parsed.owner,
        repo: parsed.repo,
        path: parsed.path,
        ref,
        commit: commit.sha,
      },
    }
  }

  const metadataCacheRoot = getGitHubPackCacheRoot(cwd, {
    owner: parsed.owner,
    repo: parsed.repo,
    commit: commit.sha,
    path: '',
  })

  await downloadGitHubSubTreeToCache({
    parsed,
    ref,
    treeSha,
    cacheRoot: metadataCacheRoot,
    subPaths: ['', 'packs'],
    entryFilter: isRepositoryMetadataEntry,
  })

  const discovery = discoverGitHubRepositoryPackRoot({
    cacheRoot: metadataCacheRoot,
    parsed,
    ref,
    source,
  })

  if (discovery.path === '') {
    return {
      source,
      root: metadataCacheRoot,
      resolved: {
        type: 'github',
        owner: parsed.owner,
        repo: parsed.repo,
        path: '',
        ref,
        commit: commit.sha,
      },
    }
  }

  const packCacheRoot = getGitHubPackCacheRoot(cwd, {
    owner: parsed.owner,
    repo: parsed.repo,
    commit: commit.sha,
    path: discovery.path,
  })

  await downloadGitHubSubTreeToCache({
    parsed,
    ref,
    treeSha,
    cacheRoot: packCacheRoot,
    subPaths: [discovery.path],
    stripPrefix: true,
  })

  return {
    source,
    root: packCacheRoot,
    resolved: {
      type: 'github',
      owner: parsed.owner,
      repo: parsed.repo,
      path: discovery.path,
      ref,
      commit: commit.sha,
    },
  }
}

function resolveGitHubPackSourceFromCache(options: {
  parsed: ParsedGitHubSource
  source: string
  cwd: string
}): ResolvedGitHubPackSource | null {
  if (options.parsed.path.length > 0) {
    const hit = findGitHubCacheHit({
      parsed: options.parsed,
      path: options.parsed.path,
      ref: options.parsed.ref,
      subPaths: [options.parsed.path],
      stripPrefix: true,
    })

    if (hit !== null) {
      return createResolvedGitHubPackSource({
        source: options.source,
        root: hit.root,
        parsed: options.parsed,
        path: options.parsed.path,
        ref: hit.ref,
        commit: hit.commit,
      })
    }

    return null
  }

  const metadataHit = findGitHubCacheHit({
    parsed: options.parsed,
    path: '',
    ref: options.parsed.ref,
    subPaths: ['', 'packs'],
    entryFilter: isRepositoryMetadataEntry,
  })

  if (metadataHit === null) {
    return null
  }

  const discovery = discoverGitHubRepositoryPackRoot({
    cacheRoot: metadataHit.root,
    parsed: options.parsed,
    ref: metadataHit.ref,
    source: options.source,
  })

  if (discovery.path === '') {
    return createResolvedGitHubPackSource({
      source: options.source,
      root: metadataHit.root,
      parsed: options.parsed,
      path: '',
      ref: metadataHit.ref,
      commit: metadataHit.commit,
    })
  }

  const packCacheRoot = getGitHubPackCacheRoot(options.cwd, {
    owner: options.parsed.owner,
    repo: options.parsed.repo,
    commit: metadataHit.commit,
    path: discovery.path,
  })
  const packHit = readGitHubCacheHitAtRoot({
    parsed: options.parsed,
    cacheRoot: packCacheRoot,
    commit: metadataHit.commit,
    ref: metadataHit.ref,
    treeSha: metadataHit.treeSha,
    subPaths: [discovery.path],
    stripPrefix: true,
  })

  if (packHit === null) {
    return null
  }

  return createResolvedGitHubPackSource({
    source: options.source,
    root: packHit.root,
    parsed: options.parsed,
    path: discovery.path,
    ref: packHit.ref,
    commit: packHit.commit,
  })
}

function createResolvedGitHubPackSource(options: {
  source: string
  root: string
  parsed: ParsedGitHubSource
  path: string
  ref: string
  commit: string
}): ResolvedGitHubPackSource {
  return {
    source: options.source,
    root: options.root,
    resolved: {
      type: 'github',
      owner: options.parsed.owner,
      repo: options.parsed.repo,
      path: options.path,
      ref: options.ref,
      commit: options.commit,
    },
  }
}

export function parseGitHubSource(source: string): ParsedGitHubSource {
  if (!source.startsWith('github:')) {
    throw new Error(`Invalid GitHub source "${source}". Expected github:...`)
  }

  const body = source.slice('github:'.length).trim()

  if (!body) {
    throw new Error('GitHub source cannot be empty.')
  }

  const hashIndex = body.indexOf('#')
  const withoutRef = hashIndex === -1 ? body : body.slice(0, hashIndex)
  const ref = hashIndex === -1 ? undefined : body.slice(hashIndex + 1)

  if (hashIndex !== -1 && (ref === undefined || ref.length === 0)) {
    throw new Error(`GitHub source "${source}" has an empty ref.`)
  }

  const segments: string[] = []
  for (const part of withoutRef.split('/')) {
    if (part.length > 0) {
      segments.push(part)
    }
  }

  if (segments.length < 2) {
    throw new Error(
      `Invalid GitHub source "${source}". Expected github:owner/repo/path#ref.`,
    )
  }

  const owner = segments[0]
  const repo = segments[1]
  const pathSegments: string[] = []
  for (let i = 2; i < segments.length; i++) {
    const value = segments[i]
    if (value !== undefined) {
      pathSegments.push(value)
    }
  }

  if (!owner || !repo) {
    throw new Error(
      `Invalid GitHub source "${source}". Expected github:owner/repo/path#ref.`,
    )
  }

  const path = normalizeGitHubPath(pathSegments.join('/'))

  const result: ParsedGitHubSource = {
    owner,
    repo,
    path,
  }

  if (ref) {
    result.ref = ref
  }

  return result
}

function discoverGitHubRepositoryPackRoot(options: {
  cacheRoot: string
  parsed: ParsedGitHubSource
  ref: string
  source: string
}): DiscoveredGitHubPackRoot {
  const rootPackFile = join(options.cacheRoot, 'airules.pack.json')

  if (existsSync(rootPackFile)) {
    return {
      root: options.cacheRoot,
      path: '',
    }
  }

  const registryPath = join(options.cacheRoot, 'registry.json')
  if (existsSync(registryPath)) {
    const registry = readRegistry(registryPath)
    const registryDefault = resolveRegistryDefaultPackPath({
      registry,
      parsed: options.parsed,
      ref: options.ref,
    })

    if (registryDefault !== null) {
      const packRoot = join(options.cacheRoot, registryDefault)
      assertDiscoveredPackExists({
        source: options.source,
        cacheRoot: options.cacheRoot,
        packPath: registryDefault,
        packRoot,
      })

      return {
        root: packRoot,
        path: registryDefault,
      }
    }

    if (registry.packs.length > 1) {
      throw new Error(
        [
          `GitHub repository "${options.parsed.owner}/${options.parsed.repo}" contains registry.json with multiple packs but no defaultPack.`,
          `Set "defaultPack" in registry.json, or specify a pack path explicitly:`,
          `  github:${options.parsed.owner}/${options.parsed.repo}/packs/<pack>${options.ref ? `#${options.ref}` : ''}`,
          `Available packs: ${registry.packs.map(pack => pack.name).join(', ')}`,
        ].join('\n'),
      )
    }
  }

  const discoveredPackPaths = discoverPacksDirectoryPackPaths(options.cacheRoot)

  if (discoveredPackPaths.length === 1) {
    const packPath = discoveredPackPaths[0]
    if (packPath !== undefined) {
      return {
        root: join(options.cacheRoot, packPath),
        path: packPath,
      }
    }
  }

  if (discoveredPackPaths.length > 1) {
    throw new Error(
      [
        `GitHub repository "${options.parsed.owner}/${options.parsed.repo}" contains multiple packs.`,
        `Set "defaultPack" in registry.json, or specify a pack path explicitly:`,
        `  github:${options.parsed.owner}/${options.parsed.repo}/packs/<pack>${options.ref ? `#${options.ref}` : ''}`,
        `Available pack paths: ${discoveredPackPaths.join(', ')}`,
      ].join('\n'),
    )
  }

  throw new Error(
    [
      `Cannot find default airules pack in GitHub repository "${options.parsed.owner}/${options.parsed.repo}".`,
      `Expected one of:`,
      `  - airules.pack.json at repository root`,
      `  - registry.json with "defaultPack"`,
      `  - exactly one packs/*/airules.pack.json`,
    ].join('\n'),
  )
}

function readRegistry(registryPath: string): AirulesRegistry {
  const raw = JSON.parse(readFileSync(registryPath, 'utf8'))
  return AirulesRegistrySchema.parse(raw)
}

function resolveRegistryDefaultPackPath(options: {
  registry: AirulesRegistry
  parsed: ParsedGitHubSource
  ref: string
}): string | null {
  const defaultPackName = options.registry.defaultPack

  if (defaultPackName !== undefined) {
    const entry = findRegistryPack(options.registry, defaultPackName)

    if (entry === null) {
      throw new Error(
        `registry.json defaultPack "${defaultPackName}" does not match any pack name or alias.`,
      )
    }

    return resolveRegistryPackPath({
      entry,
      parsed: options.parsed,
      ref: options.ref,
    })
  }

  if (options.registry.packs.length === 1) {
    const entry = options.registry.packs[0]
    if (entry !== undefined) {
      return resolveRegistryPackPath({
        entry,
        parsed: options.parsed,
        ref: options.ref,
      })
    }
  }

  return null
}

function findRegistryPack(
  registry: AirulesRegistry,
  nameOrAlias: string,
): AirulesRegistryPack | null {
  for (const pack of registry.packs) {
    if (pack.name === nameOrAlias) {
      return pack
    }

    if (pack.aliases?.includes(nameOrAlias)) {
      return pack
    }
  }

  return null
}

function resolveRegistryPackPath(options: {
  entry: AirulesRegistryPack
  parsed: ParsedGitHubSource
  ref: string
}): string {
  if (options.entry.source.startsWith('github:')) {
    const entrySource = parseGitHubSource(options.entry.source)

    if (
      entrySource.owner === options.parsed.owner &&
      entrySource.repo === options.parsed.repo
    ) {
      return entrySource.path
    }

    throw new Error(
      `registry default pack source points to another repository: ${options.entry.source}`,
    )
  }

  if (
    options.entry.source.startsWith('./') ||
    options.entry.source.startsWith('packs/')
  ) {
    return normalizeGitHubPath(
      options.entry.source.replace(/^\.\//, '').replace(/^\/+/, ''),
    )
  }

  throw new Error(
    `registry default pack must point to a pack path in the same GitHub repository: ${options.entry.source}`,
  )
}

function discoverPacksDirectoryPackPaths(cacheRoot: string): string[] {
  const packsRoot = join(cacheRoot, 'packs')

  if (!existsSync(packsRoot)) {
    return []
  }

  const result: string[] = []

  for (const entry of readdirSync(packsRoot)) {
    const packRoot = join(packsRoot, entry)

    if (!statSync(packRoot).isDirectory()) {
      continue
    }

    if (existsSync(join(packRoot, 'airules.pack.json'))) {
      result.push(normalizeGitHubPath(`packs/${entry}`))
    }
  }

  result.sort()
  return result
}

function assertDiscoveredPackExists(options: {
  source: string
  cacheRoot: string
  packPath: string
  packRoot: string
}): void {
  const target = resolve(options.packRoot)
  assertInsideDirectory(options.cacheRoot, target)

  const packFile = join(target, 'airules.pack.json')
  if (!existsSync(packFile)) {
    throw new Error(
      `Default pack "${options.packPath}" from "${options.source}" does not contain airules.pack.json.`,
    )
  }
}

export function isGitHubSource(source: string): boolean {
  return source.startsWith('github:')
}

export function getGitHubPackCacheRoot(
  cwd: string,
  options: {
    owner: string
    repo: string
    commit: string
    path: string
  },
): string {
  void cwd

  return join(
    getAirulesPackCacheDir(),
    'github',
    sanitizePathSegment(options.owner),
    sanitizePathSegment(options.repo),
    sanitizePathSegment(options.commit),
    getGitHubPathHash(options.path),
  )
}

function findGitHubCacheHit(options: {
  parsed: ParsedGitHubSource
  path: string
  ref?: string
  subPaths: string[]
  stripPrefix?: boolean
  entryFilter?: (entryPath: string) => boolean
}): GitHubCacheHit | null {
  const repoCacheRoot = join(
    getAirulesPackCacheDir(),
    'github',
    sanitizePathSegment(options.parsed.owner),
    sanitizePathSegment(options.parsed.repo),
  )

  if (!existsSync(repoCacheRoot)) {
    return null
  }

  const pathHash = getGitHubPathHash(options.path)
  const hits: GitHubCacheHit[] = []

  for (const commit of readdirSync(repoCacheRoot)) {
    const cacheRoot = join(repoCacheRoot, commit, pathHash)
    const hit = readGitHubCacheHitAtRoot({
      parsed: options.parsed,
      cacheRoot,
      commit,
      ref: options.ref,
      subPaths: options.subPaths,
      stripPrefix: options.stripPrefix,
      entryFilter: options.entryFilter,
    })

    if (hit !== null) {
      hits.push(hit)
    }
  }

  if (hits.length === 0) {
    return null
  }

  hits.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs
    }

    return right.commit.localeCompare(left.commit)
  })

  const hit = hits[0]
  return hit !== undefined ? hit : null
}

function readGitHubCacheHitAtRoot(options: {
  parsed: ParsedGitHubSource
  cacheRoot: string
  commit: string
  ref?: string
  treeSha?: string
  subPaths: string[]
  stripPrefix?: boolean
  entryFilter?: (entryPath: string) => boolean
}): GitHubCacheHit | null {
  const commitMarker = join(options.cacheRoot, '.commit')

  if (!existsSync(options.cacheRoot) || !existsSync(commitMarker)) {
    return null
  }

  const marker = parseGitHubCommitMarker(readFileSync(commitMarker, 'utf8'))
  if (marker === null) {
    return null
  }

  if (
    marker.owner !== options.parsed.owner ||
    marker.repo !== options.parsed.repo
  ) {
    return null
  }

  if (options.ref !== undefined && marker.ref !== options.ref) {
    return null
  }

  if (options.treeSha !== undefined && marker.treeSha !== options.treeSha) {
    return null
  }

  if (marker.subPaths !== options.subPaths.join('|')) {
    return null
  }

  if (marker.stripMode !== (options.stripPrefix ? 'strip' : 'keep')) {
    return null
  }

  const entryFilterName =
    options.entryFilter !== undefined ? options.entryFilter.name : 'no-filter'

  if (marker.entryFilterName !== entryFilterName) {
    return null
  }

  return {
    root: options.cacheRoot,
    ref: marker.ref,
    commit: options.commit,
    treeSha: marker.treeSha,
    mtimeMs: statSync(commitMarker).mtimeMs,
  }
}

function parseGitHubCommitMarker(value: string): GitHubCommitMarker | null {
  const lines = value.trim().split('\n')

  if (lines.length < 7) {
    return null
  }

  const owner = lines[0]
  const repo = lines[1]
  const ref = lines[2]
  const treeSha = lines[3]
  const subPaths = lines[4]
  const stripMode = lines[5]
  const entryFilterName = lines[6]

  if (
    owner === undefined ||
    repo === undefined ||
    ref === undefined ||
    treeSha === undefined ||
    subPaths === undefined ||
    stripMode === undefined ||
    entryFilterName === undefined
  ) {
    return null
  }

  return {
    owner,
    repo,
    ref,
    treeSha,
    subPaths,
    stripMode,
    entryFilterName,
  }
}

function getGitHubPathHash(path: string): string {
  return sha256(path || '.')
    .replace(/^sha256-/, '')
    .slice(0, 16)
}

async function fetchDefaultBranch(parsed: ParsedGitHubSource): Promise<string> {
  const repo = await fetchGitHubJson<GitHubRepoResponse>(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
  )

  if (!repo.default_branch) {
    throw new Error(
      `Cannot resolve default branch for ${parsed.owner}/${parsed.repo}.`,
    )
  }

  return repo.default_branch
}

async function fetchGitHubCommit(
  parsed: ParsedGitHubSource,
  ref: string,
): Promise<GitHubCommitResponse> {
  return fetchGitHubJson<GitHubCommitResponse>(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits/${encodeURIComponent(ref)}`,
  )
}

async function downloadGitHubSubTreeToCache(options: {
  parsed: ParsedGitHubSource
  ref: string
  treeSha: string
  cacheRoot: string
  subPaths: string[]
  stripPrefix?: boolean
  entryFilter?: (entryPath: string) => boolean
}): Promise<void> {
  const commitMarker = join(options.cacheRoot, '.commit')

  if (
    existsSync(options.cacheRoot) &&
    existsSync(commitMarker) &&
    readFileSync(commitMarker, 'utf8').trim() === commitMarkerKey(options)
  ) {
    return
  }

  const tree = await fetchGitHubJson<GitHubTreeResponse>(
    `https://api.github.com/repos/${encodeURIComponent(options.parsed.owner)}/${encodeURIComponent(options.parsed.repo)}/git/trees/${encodeURIComponent(options.treeSha)}?recursive=1`,
  )

  if (tree.truncated) {
    throw new Error(
      `GitHub tree for ${options.parsed.owner}/${options.parsed.repo} is truncated. Phase 2 cannot safely download truncated trees.`,
    )
  }

  const entries = tree.tree !== undefined ? tree.tree : []
  const subPaths = options.subPaths.map(subPath => normalizeGitHubPath(subPath))
  const filter = options.entryFilter
  const fileEntries: GitHubTreeEntry[] = []

  for (const entry of entries) {
    if (entry.type !== 'blob' || !entry.path) {
      continue
    }

    if (!isInsideAnySubPath(entry.path, subPaths)) {
      continue
    }

    if (filter !== undefined && !filter(entry.path)) {
      continue
    }

    fileEntries.push(entry)
  }

  if (fileEntries.length === 0) {
    if (options.entryFilter !== undefined) {
      if (existsSync(options.cacheRoot)) {
        rmSync(options.cacheRoot, {
          recursive: true,
          force: true,
        })
      }

      mkdirSync(options.cacheRoot, {
        recursive: true,
      })
      return
    }

    throw new Error(
      `Cannot find files under "${subPaths.join(', ') || '.'}" in ${options.parsed.owner}/${options.parsed.repo}@${options.ref}.`,
    )
  }

  if (existsSync(options.cacheRoot)) {
    rmSync(options.cacheRoot, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(options.cacheRoot, {
    recursive: true,
  })

  const stripPrefix = options.stripPrefix === true

  for (const entry of fileEntries) {
    if (!entry.sha || !entry.path) {
      continue
    }

    const relativePath = stripPrefix
      ? stripAnySubPath(entry.path, subPaths)
      : entry.path

    if (!relativePath) {
      throw new Error(
        `Refusing to write empty GitHub entry path: ${entry.path}`,
      )
    }

    const targetPath = resolve(options.cacheRoot, relativePath)
    assertInsideDirectory(options.cacheRoot, targetPath)

    const blob = await fetchGitHubJson<GitHubBlobResponse>(
      `https://api.github.com/repos/${encodeURIComponent(options.parsed.owner)}/${encodeURIComponent(options.parsed.repo)}/git/blobs/${encodeURIComponent(entry.sha)}`,
    )

    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new Error(
        `Unsupported GitHub blob encoding for ${entry.path}. Expected base64.`,
      )
    }

    const content = Buffer.from(blob.content.replace(/\s/g, ''), 'base64')

    mkdirSync(dirname(targetPath), {
      recursive: true,
    })
    writeFileSync(targetPath, content)
  }

  writeFileSync(commitMarker, commitMarkerKey(options))
}

function commitMarkerKey(options: {
  parsed: ParsedGitHubSource
  ref: string
  treeSha: string
  subPaths: string[]
  stripPrefix?: boolean
  entryFilter?: (entryPath: string) => boolean
}): string {
  return [
    options.parsed.owner,
    options.parsed.repo,
    options.ref,
    options.treeSha,
    options.subPaths.join('|'),
    options.stripPrefix ? 'strip' : 'keep',
    options.entryFilter?.name ?? 'no-filter',
  ].join('\n')
}

function isInsideAnySubPath(entryPath: string, subPaths: string[]): boolean {
  for (const subPath of subPaths) {
    if (isInsidePackPath(entryPath, subPath)) {
      return true
    }
  }

  return false
}

function stripAnySubPath(entryPath: string, subPaths: string[]): string {
  for (const subPath of subPaths) {
    const stripped = stripPackPath(entryPath, subPath)
    if (stripped !== null) {
      return stripped
    }
  }

  return entryPath
}

function stripPackPath(entryPath: string, packPath: string): string | null {
  if (!packPath) {
    return null
  }

  if (entryPath === packPath) {
    return ''
  }

  if (entryPath.startsWith(`${packPath}/`)) {
    return entryPath.slice(packPath.length + 1)
  }

  return null
}

function isRepositoryMetadataEntry(entryPath: string): boolean {
  if (entryPath === 'airules.pack.json' || entryPath === 'registry.json') {
    return true
  }

  if (
    entryPath.startsWith('packs/') &&
    entryPath.endsWith('/airules.pack.json')
  ) {
    const rest = entryPath.slice('packs/'.length)
    if (rest.includes('/')) {
      const parts = rest.split('/')
      return parts.length === 2 && parts[0] !== undefined && parts[0].length > 0
    }

    return false
  }

  return false
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: createGitHubHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `GitHub request failed: ${response.status} ${response.statusText} ${url}${body ? `\n${body}` : ''}`,
    )
  }

  return (await response.json()) as T
}

function createGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'airules',
    'x-github-api-version': '2022-11-28',
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

export function normalizeGitHubPath(value: string): string {
  const segments: string[] = []

  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (part.length === 0) {
      continue
    }

    if (part === '.' || part === '..') {
      throw new Error(`Invalid GitHub path segment "${part}".`)
    }

    segments.push(part)
  }

  return segments.join('/')
}

function isInsidePackPath(
  entryPath: string | undefined,
  packPath: string,
): boolean {
  if (!entryPath) {
    return false
  }

  const normalizedEntryPath = normalizeGitHubPath(entryPath)

  if (!packPath) {
    return true
  }

  return (
    normalizedEntryPath === packPath ||
    normalizedEntryPath.startsWith(`${packPath}/`)
  )
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}

function assertInsideDirectory(root: string, target: string): void {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const relativePath = relative(resolvedRoot, resolvedTarget)

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    resolve(relativePath) === relativePath
  ) {
    throw new Error(`Refusing to write outside cache root: ${target}`)
  }
}
