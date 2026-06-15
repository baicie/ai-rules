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

export async function resolveGitHubPackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedGitHubPackSource> {
  const parsed = parseGitHubSource(source)
  const ref =
    parsed.ref !== undefined ? parsed.ref : await fetchDefaultBranch(parsed)
  const commit = await fetchGitHubCommit(parsed, ref)
  const treeSha = commit.commit && commit.commit.tree && commit.commit.tree.sha

  if (!treeSha) {
    throw new Error(
      `Cannot resolve tree sha for GitHub source "${source}" at ref "${ref}".`,
    )
  }

  const cacheRoot = getGitHubPackCacheRoot(cwd, {
    owner: parsed.owner,
    repo: parsed.repo,
    commit: commit.sha,
    path: parsed.path,
  })

  await downloadGitHubPackToCache({
    parsed,
    ref,
    treeSha,
    cacheRoot,
  })

  const discovered =
    parsed.path.length === 0
      ? discoverGitHubRepositoryPackRoot({
          cacheRoot,
          parsed,
          ref,
          source,
        })
      : {
          root: cacheRoot,
          path: parsed.path,
        }

  const resolved: ResolvedGitHubPackSource['resolved'] = {
    type: 'github',
    owner: parsed.owner,
    repo: parsed.repo,
    path: discovered.path,
    ref,
    commit: commit.sha,
  }

  return {
    source,
    root: discovered.root,
    resolved,
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

  const pathHash = sha256(options.path || '.')
    .replace(/^sha256-/, '')
    .slice(0, 16)

  return join(
    getAirulesPackCacheDir(),
    'github',
    sanitizePathSegment(options.owner),
    sanitizePathSegment(options.repo),
    sanitizePathSegment(options.commit),
    pathHash,
  )
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

async function downloadGitHubPackToCache(options: {
  parsed: ParsedGitHubSource
  ref: string
  treeSha: string
  cacheRoot: string
}): Promise<void> {
  const tree = await fetchGitHubJson<GitHubTreeResponse>(
    `https://api.github.com/repos/${encodeURIComponent(options.parsed.owner)}/${encodeURIComponent(options.parsed.repo)}/git/trees/${encodeURIComponent(options.treeSha)}?recursive=1`,
  )

  if (tree.truncated) {
    throw new Error(
      `GitHub tree for ${options.parsed.owner}/${options.parsed.repo} is truncated. Phase 2 cannot safely download truncated trees.`,
    )
  }

  const entries = tree.tree !== undefined ? tree.tree : []
  const packPath = normalizeGitHubPath(options.parsed.path)
  const fileEntries: GitHubTreeEntry[] = []

  for (const entry of entries) {
    if (entry.type === 'blob' && isInsidePackPath(entry.path, packPath)) {
      fileEntries.push(entry)
    }
  }

  if (fileEntries.length === 0) {
    throw new Error(
      `Cannot find files under "${packPath || '.'}" in ${options.parsed.owner}/${options.parsed.repo}@${options.ref}.`,
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

  for (const entry of fileEntries) {
    if (!entry.sha || !entry.path) {
      continue
    }

    const relativePath = stripPackPath(entry.path, packPath)

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

function stripPackPath(entryPath: string, packPath: string): string {
  const normalizedEntryPath = normalizeGitHubPath(entryPath)

  if (!packPath) {
    return normalizedEntryPath
  }

  if (normalizedEntryPath === packPath) {
    return ''
  }

  return normalizedEntryPath.slice(packPath.length + 1)
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
