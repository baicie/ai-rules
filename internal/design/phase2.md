下面给 **Phase 2：GitHub Source + Cache + 安全校验** 的完整方案与代码。

当前 `e8088d3` 的 Phase 1 已经实现了本地 pack 安装，但 `source.ts` 明确拒绝 `github:` source，这是 Phase 2 的核心切入点。
当前 installer 仍然直接调用 `resolveLocalPackSource + loadLocalPack`，所以 Phase 2 不需要重写安装流程，只要把 source 解析升级为 **local/github 双通道**，并把 GitHub pack 下载到 `.agents/agent/cache` 后复用现有 `loadLocalPack`。

---

# Phase 2 目标

## 支持范围

```txt
1. 支持 github source：
   github:owner/repo/path#ref

2. 支持默认分支：
   github:owner/repo/path

3. 支持 GitHub API 下载 pack 到：
   .agents/agent/cache/github/<owner>/<repo>/<commit>/<pathHash>

4. 支持 GITHUB_TOKEN / GH_TOKEN 访问私有仓库或提高 rate limit。

5. 支持 lockfile 记录：
   owner / repo / path / ref / commit

6. 支持安全校验：
   - requirePinnedVersion
   - trustedSources warning
   - 非 local/github source 明确拒绝

7. CLI add / update / diff 改用 async installPack。

8. Phase 2 仍然只安装 modules + managed-block。
```

---

# Source 规范

## local

```bash
airules add ./packs/react-shadcn
airules add local:./packs/react-shadcn
airules add file:///Users/me/packs/react-shadcn
```

## github

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0
airules add github:baicie/ai-rules/packs/react-shadcn#main
airules add github:baicie/ai-rules/packs/react-shadcn#e8088d3
```

## 默认分支

```bash
airules add github:baicie/ai-rules/packs/react-shadcn
```

未指定 `#ref` 时，会请求 repo metadata 读取 `default_branch`。

---

# 需要新增 / 修改的文件

```txt
packages/core/src/
├── github-source.ts          # 新增
├── security.ts               # 新增
├── source.ts                 # 替换
├── pack-loader.ts            # 小改：接收 ResolvedPackSource
├── installer.ts              # 替换：新增 async installPack
├── index.ts                  # 导出新增模块
├── github-source.test.ts     # 新增
├── security.test.ts          # 新增
├── source.test.ts            # 替换/增强
└── installer.test.ts         # 增强 github source 测试

packages/cli/src/
├── commands/add.ts           # 改用 installPack + security
├── commands/update.ts        # 改用 installPack + security
└── commands/diff.ts          # 改用 installPack + security

docs/
└── phase2.md                 # 新增
```

---

# 1. 新增 `packages/core/src/github-source.ts`

```ts
import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { getAirulesAgentDir } from './config-loader'
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
  type?: 'blob' | 'tree' | string
  sha?: string
  size?: number
  url?: string
}

interface GitHubBlobResponse {
  content?: string
  encoding?: string
  sha?: string
}

export async function resolveGitHubPackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedGitHubPackSource> {
  const parsed = parseGitHubSource(source)
  const ref = parsed.ref ?? (await fetchDefaultBranch(parsed))
  const commit = await fetchGitHubCommit(parsed, ref)
  const treeSha = commit.commit?.tree?.sha

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

  if (hashIndex !== -1 && !ref) {
    throw new Error(`GitHub source "${source}" has an empty ref.`)
  }

  const segments = withoutRef.split('/').filter(Boolean)

  if (segments.length < 2) {
    throw new Error(
      `Invalid GitHub source "${source}". Expected github:owner/repo/path#ref.`,
    )
  }

  const [owner, repo, ...pathSegments] = segments

  if (!owner || !repo) {
    throw new Error(
      `Invalid GitHub source "${source}". Expected github:owner/repo/path#ref.`,
    )
  }

  return {
    owner,
    repo,
    path: normalizeGitHubPath(pathSegments.join('/')),
    ...(ref ? { ref } : {}),
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
  const pathHash = sha256(options.path || '.')
    .replace(/^sha256-/, '')
    .slice(0, 16)

  return join(
    getAirulesAgentDir(cwd),
    'cache',
    'github',
    sanitizePathSegment(options.owner),
    sanitizePathSegment(options.repo),
    options.commit,
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

  const entries = tree.tree ?? []
  const packPath = normalizeGitHubPath(options.parsed.path)
  const fileEntries = entries.filter(entry => {
    return entry.type === 'blob' && isInsidePackPath(entry.path, packPath)
  })

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
    const targetPath = join(options.cacheRoot, relativePath)
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

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN

  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  return headers
}

function normalizeGitHubPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
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
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function assertInsideDirectory(root: string, target: string): void {
  const normalizedRoot = join(root, '.')
  const normalizedTarget = join(target)

  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to write outside cache root: ${target}`)
  }
}
```

---

# 2. 替换 `packages/core/src/source.ts`

```ts
import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  isGitHubSource,
  resolveGitHubPackSource,
  type ResolvedGitHubPackSource,
} from './github-source'

export interface ResolvedPackSource {
  source: string
  root: string
  resolved: AirulesResolvedSource
}

export interface ResolvedLocalPackSource extends ResolvedPackSource {
  resolved: Extract<AirulesResolvedSource, { type: 'local' }>
}

export type ResolvedAnyPackSource =
  | ResolvedLocalPackSource
  | ResolvedGitHubPackSource

export async function resolvePackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedAnyPackSource> {
  if (isGitHubSource(source)) {
    return resolveGitHubPackSource(source, cwd)
  }

  return resolveLocalPackSource(source, cwd)
}

export function resolveLocalPackSource(
  source: string,
  cwd = process.cwd(),
): ResolvedLocalPackSource {
  if (source.startsWith('github:')) {
    throw new Error('Use resolvePackSource() for github sources.')
  }

  if (source.startsWith('npm:')) {
    throw new Error('npm source is not supported in Phase 2.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported in Phase 2.')
  }

  const normalizedSource = source.startsWith('local:')
    ? source.slice('local:'.length)
    : source

  const localPath = normalizedSource.startsWith('file://')
    ? fileURLToPath(normalizedSource)
    : normalizedSource

  const root = isAbsolute(localPath) ? localPath : resolve(cwd, localPath)

  return {
    source,
    root,
    resolved: {
      type: 'local',
      path: root,
    },
  }
}
```

---

# 3. 修改 `packages/core/src/pack-loader.ts`

只要把类型从 `ResolvedLocalPackSource` 改成 `ResolvedPackSource`。

```ts
import type { AirulesPack } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { AirulesPackSchema } from '@baicie/airules-schema'
import type { ResolvedPackSource } from './source'

export interface LoadedAirulesPack {
  root: string
  packFilePath: string
  pack: AirulesPack
  rawContent: string
}

export function loadLocalPack(source: ResolvedPackSource): LoadedAirulesPack {
  const sourcePath = source.root
  const packFilePath = sourcePath.endsWith('.json')
    ? sourcePath
    : join(sourcePath, 'airules.pack.json')

  if (!existsSync(packFilePath)) {
    throw new Error(`Cannot find airules.pack.json at ${packFilePath}.`)
  }

  const rawContent = readFileSync(packFilePath, 'utf8')
  const rawPack = JSON.parse(rawContent)
  const pack = AirulesPackSchema.parse(rawPack)
  const root = dirname(resolve(packFilePath))

  return {
    root,
    packFilePath,
    pack,
    rawContent,
  }
}
```

---

# 4. 新增 `packages/core/src/security.ts`

```ts
import type { AirulesConfig } from '@baicie/airules-schema'
import { isGitHubSource, parseGitHubSource } from './github-source'

export interface SourceSecurityResult {
  warnings: string[]
}

export function validateSourceSecurity(
  source: string,
  security: AirulesConfig['security'] | undefined,
): SourceSecurityResult {
  const warnings: string[] = []

  if (!security) {
    return {
      warnings,
    }
  }

  if (
    security.requirePinnedVersion === true &&
    isGitHubSource(source) &&
    !hasPinnedGitHubRef(source)
  ) {
    throw new Error(
      `GitHub source "${source}" is not pinned. Add "#<tag-or-commit>" or disable security.requirePinnedVersion.`,
    )
  }

  const trustedSources = security.trustedSources ?? []

  if (trustedSources.length > 0 && !isTrustedSource(source, trustedSources)) {
    warnings.push(
      `Source "${source}" is not listed in security.trustedSources.`,
    )
  }

  return {
    warnings,
  }
}

export function hasPinnedGitHubRef(source: string): boolean {
  if (!isGitHubSource(source)) {
    return true
  }

  const parsed = parseGitHubSource(source)
  return typeof parsed.ref === 'string' && parsed.ref.length > 0
}

export function isTrustedSource(
  source: string,
  trustedSources: string[],
): boolean {
  return trustedSources.some(trustedSource => {
    return source === trustedSource || source.startsWith(trustedSource)
  })
}
```

---

# 5. 替换 `packages/core/src/installer.ts`

核心变化：

```txt
1. 新增 async installPack()
2. installPack 支持 local/github source
3. 保留 installLocalPack() 兼容本地同步测试和旧调用
4. GitHub lockfile 记录 commit
5. operation 增加 renderedContent / managedBlock，方便 diff
```

```ts
import type {
  AgentName,
  AirulesInstall,
  AirulesLockInstall,
  AirulesLockPack,
  MergeStrategy,
} from '@baicie/airules-schema'
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
import {
  resolveLocalPackSource,
  resolvePackSource,
  type ResolvedPackSource,
} from './source'

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
```

---

# 6. 修改 `packages/core/src/index.ts`

```ts
export * from './config-loader'
export * from './config-writer'
export * from './constants'
export * from './github-source'
export * from './hash'
export * from './installer'
export * from './lockfile'
export * from './managed-block'
export * from './module-renderer'
export * from './pack-loader'
export * from './profile'
export * from './security'
export * from './source'
```

---

# 7. 修改 `packages/cli/src/commands/add.ts`

```ts
import type { AgentName, AirulesConfig } from '@baicie/airules-schema'
import {
  installPack,
  loadAirulesConfigSync,
  upsertConfigPack,
  validateSourceSecurity,
  writeAirulesConfig,
} from '@baicie/airules-core'

export interface AddCommandOptions {
  cwd: string
  source: string
  profile?: string
  agent?: string
  dryRun?: boolean
  save?: boolean
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const agents = parseAgentList(options.agent)
  const config = loadConfigOrCreateEmpty(options.cwd)

  const securityResult = validateSourceSecurity(options.source, config.security)

  for (const warning of securityResult.warnings) {
    console.warn(`warning: ${warning}`)
  }

  const result = await installPack({
    cwd: options.cwd,
    source: options.source,
    profile: options.profile,
    agents,
    dryRun: options.dryRun,
  })

  printInstallSummary(result.operations, Boolean(options.dryRun))

  if (!options.dryRun && options.save !== false) {
    const nextConfig = upsertConfigPack(config, {
      name: result.packName,
      source: options.source,
      profile: options.profile,
      agents,
    })

    writeAirulesConfig(options.cwd, nextConfig)

    console.info(`Saved pack config for ${result.packName}.`)
  }
}

function parseAgentList(agent: string | undefined): AgentName[] | undefined {
  if (!agent) {
    return undefined
  }

  const agents = agent
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return agents.length > 0 ? agents : undefined
}

function loadConfigOrCreateEmpty(cwd: string): AirulesConfig {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return {
      version: 1,
      packs: [],
      install: {
        conflict: 'warn',
      },
      security: {
        trustedSources: [],
        allowScripts: false,
        requirePinnedVersion: false,
      },
    }
  }
}

function printInstallSummary(
  operations: Array<{
    target: string
    installId: string
    agent: AgentName
    action: string
  }>,
  dryRun: boolean,
): void {
  console.info(dryRun ? 'airules add dry-run' : 'airules add')

  for (const operation of operations) {
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
    )
  }
}
```

---

# 8. 修改 `packages/cli/src/commands/update.ts`

```ts
import type { AirulesConfigPack } from '@baicie/airules-schema'
import {
  installPack,
  loadAirulesConfigSync,
  validateSourceSecurity,
} from '@baicie/airules-core'

export interface UpdateCommandOptions {
  cwd: string
  name?: string
  dryRun?: boolean
}

export async function runUpdateCommand(
  options: UpdateCommandOptions,
): Promise<void> {
  const config = loadAirulesConfigSync(options.cwd)
  const packs = filterPacks(config.packs, options.name)

  if (packs.length === 0) {
    throw new Error(
      options.name
        ? `Cannot find configured pack "${options.name}".`
        : 'No configured packs found.',
    )
  }

  console.info(options.dryRun ? 'airules update dry-run' : 'airules update')

  for (const pack of packs) {
    const securityResult = validateSourceSecurity(pack.source, config.security)

    for (const warning of securityResult.warnings) {
      console.warn(`warning: ${warning}`)
    }

    const result = await installPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
      dryRun: options.dryRun,
    })

    console.info(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.info(
        `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
      )
    }
  }
}

function filterPacks(
  packs: AirulesConfigPack[],
  name: string | undefined,
): AirulesConfigPack[] {
  if (!name) {
    return packs
  }

  return packs.filter(pack => pack.name === name || pack.source === name)
}
```

---

# 9. 修改 `packages/cli/src/commands/diff.ts`

```ts
import {
  installPack,
  loadAirulesConfigSync,
  validateSourceSecurity,
} from '@baicie/airules-core'

export interface DiffCommandOptions {
  cwd: string
  name?: string
}

export async function runDiffCommand(
  options: DiffCommandOptions,
): Promise<void> {
  const config = loadAirulesConfigSync(options.cwd)
  const packs = options.name
    ? config.packs.filter(
        pack => pack.name === options.name || pack.source === options.name,
      )
    : config.packs

  if (packs.length === 0) {
    throw new Error(
      options.name
        ? `Cannot find configured pack "${options.name}".`
        : 'No configured packs found.',
    )
  }

  console.info('airules diff')

  for (const pack of packs) {
    const securityResult = validateSourceSecurity(pack.source, config.security)

    for (const warning of securityResult.warnings) {
      console.warn(`warning: ${warning}`)
    }

    const result = await installPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
      dryRun: true,
    })

    console.info(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.info(`\n--- ${operation.target}`)
      console.info(`action: ${operation.action}`)
      console.info(`install: ${operation.agent}:${operation.installId}`)

      if (operation.action === 'unchanged') {
        continue
      }

      console.info('\nmanaged block:\n')
      console.info(operation.managedBlock)
    }
  }
}
```

---

# 10. 单元测试

## `packages/core/src/github-source.test.ts`

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getGitHubPackCacheRoot,
  parseGitHubSource,
  resolveGitHubPackSource,
} from './github-source'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-github-'))
  return currentTmpDir
}

afterEach(() => {
  vi.unstubAllGlobals()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('parseGitHubSource', () => {
  it('parses github source with path and ref', () => {
    expect(
      parseGitHubSource('github:baicie/ai-rules/packs/react-shadcn#v0.1.0'),
    ).toEqual({
      owner: 'baicie',
      repo: 'ai-rules',
      path: 'packs/react-shadcn',
      ref: 'v0.1.0',
    })
  })

  it('parses github source without path', () => {
    expect(parseGitHubSource('github:baicie/ai-rules#main')).toEqual({
      owner: 'baicie',
      repo: 'ai-rules',
      path: '',
      ref: 'main',
    })
  })

  it('throws for invalid source', () => {
    expect(() => parseGitHubSource('github:baicie')).toThrow(
      /Expected github:owner\/repo\/path#ref/,
    )
  })

  it('throws for empty ref', () => {
    expect(() => parseGitHubSource('github:baicie/ai-rules#')).toThrow(
      /empty ref/,
    )
  })
})

describe('resolveGitHubPackSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createMockFetch())
  })

  it('downloads github pack into cache and resolves commit', async () => {
    const cwd = createTempProject()

    const resolved = await resolveGitHubPackSource(
      'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      cwd,
    )

    expect(resolved.resolved).toEqual({
      type: 'github',
      owner: 'baicie',
      repo: 'ai-rules',
      path: 'packs/react-shadcn',
      ref: 'v0.1.0',
      commit: 'commit-sha-123',
    })

    expect(existsSync(join(resolved.root, 'airules.pack.json'))).toBe(true)
    expect(existsSync(join(resolved.root, 'modules/core.md'))).toBe(true)

    const pack = readFileSync(join(resolved.root, 'airules.pack.json'), 'utf8')
    expect(pack).toContain('@baicie/react-shadcn')
  })

  it('uses default branch when ref is omitted', async () => {
    const cwd = createTempProject()

    const resolved = await resolveGitHubPackSource(
      'github:baicie/ai-rules/packs/react-shadcn',
      cwd,
    )

    expect(resolved.resolved.ref).toBe('main')
    expect(resolved.resolved.commit).toBe('commit-sha-123')
  })

  it('creates deterministic cache path', () => {
    const cacheRoot = getGitHubPackCacheRoot('/repo', {
      owner: 'baicie',
      repo: 'ai-rules',
      commit: 'abc',
      path: 'packs/react-shadcn',
    })

    expect(cacheRoot).toMatch(
      /[\\/]repo[\\/]\.agents[\\/]agent[\\/]cache[\\/]github[\\/]baicie[\\/]ai-rules[\\/]abc[\\/]/,
    )
  })
})

function createMockFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://api.github.com/repos/baicie/ai-rules') {
      return createJsonResponse({
        default_branch: 'main',
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/commits/v0.1.0' ||
      url === 'https://api.github.com/repos/baicie/ai-rules/commits/main'
    ) {
      return createJsonResponse({
        sha: 'commit-sha-123',
        commit: {
          tree: {
            sha: 'tree-sha-123',
          },
        },
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/trees/tree-sha-123?recursive=1'
    ) {
      return createJsonResponse({
        truncated: false,
        tree: [
          {
            path: 'packs/react-shadcn/airules.pack.json',
            type: 'blob',
            sha: 'blob-pack',
          },
          {
            path: 'packs/react-shadcn/modules/core.md',
            type: 'blob',
            sha: 'blob-core',
          },
          {
            path: 'README.md',
            type: 'blob',
            sha: 'blob-readme',
          },
        ],
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-pack'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            modules: {
              core: 'modules/core.md',
            },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-core'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from('## Core\n\n- Use TypeScript.').toString('base64'),
      })
    }

    return createJsonResponse(
      {
        message: `Unexpected URL: ${url}`,
      },
      404,
    )
  }) as typeof fetch
}

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}
```

---

## `packages/core/src/source.test.ts`

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveLocalPackSource, resolvePackSource } from './source'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveLocalPackSource', () => {
  it('resolves relative local source', () => {
    const result = resolveLocalPackSource('./packs/react-shadcn', '/repo')

    expect(result.source).toBe('./packs/react-shadcn')
    expect(result.root).toMatch(/[\\/]repo[\\/]packs[\\/]react-shadcn$/)
    expect(result.resolved.type).toBe('local')
  })

  it('resolves local: source', () => {
    const result = resolveLocalPackSource('local:./packs/react-shadcn', '/repo')

    expect(result.root).toMatch(/[\\/]repo[\\/]packs[\\/]react-shadcn$/)
  })

  it('tells callers to use resolvePackSource for github source', () => {
    expect(() =>
      resolveLocalPackSource('github:baicie/ai-rules/packs/react-shadcn'),
    ).toThrow(/Use resolvePackSource/)
  })

  it('rejects npm source in Phase 2', () => {
    expect(() => resolveLocalPackSource('npm:@baicie/react-shadcn')).toThrow(
      /npm source is not supported in Phase 2/,
    )
  })
})

describe('resolvePackSource', () => {
  it('delegates local sources to local resolver', async () => {
    const result = await resolvePackSource('./packs/react-shadcn', '/repo')

    expect(result.resolved.type).toBe('local')
  })
})
```

---

## `packages/core/src/security.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  hasPinnedGitHubRef,
  isTrustedSource,
  validateSourceSecurity,
} from './security'

describe('security', () => {
  it('detects pinned github ref', () => {
    expect(
      hasPinnedGitHubRef('github:baicie/ai-rules/packs/react-shadcn#v0.1.0'),
    ).toBe(true)

    expect(
      hasPinnedGitHubRef('github:baicie/ai-rules/packs/react-shadcn'),
    ).toBe(false)
  })

  it('throws when pinned version is required', () => {
    expect(() =>
      validateSourceSecurity('github:baicie/ai-rules/packs/react-shadcn', {
        requirePinnedVersion: true,
      }),
    ).toThrow(/is not pinned/)
  })

  it('returns warning for untrusted source', () => {
    const result = validateSourceSecurity('github:someone/rules/packs/react', {
      trustedSources: ['github:baicie/ai-rules'],
    })

    expect(result.warnings).toEqual([
      'Source "github:someone/rules/packs/react" is not listed in security.trustedSources.',
    ])
  })

  it('matches trusted source by prefix', () => {
    expect(
      isTrustedSource('github:baicie/ai-rules/packs/react-shadcn#v0.1.0', [
        'github:baicie/ai-rules',
      ]),
    ).toBe(true)
  })
})
```

---

## `packages/core/src/installer.test.ts` 追加 GitHub 测试

在现有 `installer.test.ts` 里追加：

```ts
import { vi } from 'vitest'
import { installPack } from './installer'

it('installs github pack through cache', async () => {
  const cwd = createTempProject()

  vi.stubGlobal('fetch', createInstallerGitHubMockFetch())

  const result = await installPack({
    cwd,
    source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
    agents: ['codex'],
  })

  expect(result.packName).toBe('@baicie/react-shadcn')
  expect(result.operations[0]?.action).toBe('create')

  const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
  expect(agents).toContain('## Core')
  expect(agents).toContain('install="codex"')

  const lockfile = readAirulesLockfile(cwd)
  expect(lockfile.packs[0]?.resolved).toEqual({
    type: 'github',
    owner: 'baicie',
    repo: 'ai-rules',
    path: 'packs/react-shadcn',
    ref: 'v0.1.0',
    commit: 'commit-sha-123',
  })

  vi.unstubAllGlobals()
})

function createInstallerGitHubMockFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://api.github.com/repos/baicie/ai-rules/commits/v0.1.0') {
      return createInstallerJsonResponse({
        sha: 'commit-sha-123',
        commit: {
          tree: {
            sha: 'tree-sha-123',
          },
        },
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/trees/tree-sha-123?recursive=1'
    ) {
      return createInstallerJsonResponse({
        truncated: false,
        tree: [
          {
            path: 'packs/react-shadcn/airules.pack.json',
            type: 'blob',
            sha: 'blob-pack',
          },
          {
            path: 'packs/react-shadcn/modules/core.md',
            type: 'blob',
            sha: 'blob-core',
          },
        ],
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-pack'
    ) {
      return createInstallerJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            modules: {
              core: 'modules/core.md',
            },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
                merge: 'managed-block',
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-core'
    ) {
      return createInstallerJsonResponse({
        encoding: 'base64',
        content: Buffer.from('## Core\n\n- From GitHub.').toString('base64'),
      })
    }

    return createInstallerJsonResponse(
      {
        message: `Unexpected URL: ${url}`,
      },
      404,
    )
  }) as typeof fetch
}

function createInstallerJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}
```

注意：如果测试文件已有 `import { afterEach, describe, expect, it } from 'vitest'`，要改成：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
```

---

# 11. `docs/phase2.md`

````md
# Phase 2 Design

## Goal

Phase 2 adds GitHub source support to the local module installer.

Phase 1 supports only local packs. Phase 2 supports:

```txt
github:owner/repo/path#ref
```
````

The GitHub pack is downloaded into:

```txt
.agents/agent/cache/github/<owner>/<repo>/<commit>/<pathHash>
```

Then the existing local pack loader installs it from cache.

## Supported

- GitHub source parsing
- default branch resolution
- commit resolution
- recursive tree download
- blob download
- cache write
- lockfile commit recording
- `GITHUB_TOKEN` / `GH_TOKEN`
- `security.requirePinnedVersion`
- `security.trustedSources` warning

## Not supported yet

- npm source
- http tarball source
- template mode
- file mode
- directory mode
- remove
- registry search

## Examples

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0 --agent codex
airules add github:baicie/ai-rules/packs/react-shadcn#main --agent codex
airules add github:baicie/ai-rules/packs/react-shadcn --agent codex
```

## Security

When config contains:

```ts
security: {
  requirePinnedVersion: true
}
```

This source is rejected:

```txt
github:baicie/ai-rules/packs/react-shadcn
```

Use:

```txt
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

or:

```txt
github:baicie/ai-rules/packs/react-shadcn#<commit>
```

## GitHub API

Phase 2 uses:

```txt
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/commits/{ref}
GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1
GET /repos/{owner}/{repo}/git/blobs/{sha}
```

## Auth

Set one of:

```bash
export GITHUB_TOKEN=...
export GH_TOKEN=...
```

## Lockfile

GitHub sources are locked as:

```json
{
  "type": "github",
  "owner": "baicie",
  "repo": "ai-rules",
  "path": "packs/react-shadcn",
  "ref": "v0.1.0",
  "commit": "abc123"
}
```

````

---

# 验证命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
````

手动验证：

```bash
pnpm --filter @baicie/airules build

node packages/cli/dist/bin.js add github:baicie/ai-rules/packs/react-shadcn#main --agent codex --dry-run

node packages/cli/dist/bin.js add github:baicie/ai-rules/packs/react-shadcn#main --agent codex

node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js diff
node packages/cli/dist/bin.js update
```

---

# Phase 2 验收标准

```txt
1. github:owner/repo/path#ref 能安装成功。
2. github:owner/repo/path 未指定 ref 时能读取 default_branch。
3. GitHub pack 会缓存到 .agents/agent/cache/github。
4. lockfile 会记录 commit。
5. GITHUB_TOKEN / GH_TOKEN 会被用于请求 header。
6. security.requirePinnedVersion=true 时拒绝未带 #ref 的 github source。
7. trustedSources 不匹配时输出 warning。
8. 本地 source 原能力不回退。
9. Phase 2 仍然拒绝 npm/http source。
10. template/file/directory mode 仍然明确报错。
```

---

# 建议提交信息

```txt
feat: add phase2 github source cache installer
```

这版做完后，`airules` 就可以从你自己的 `baicie/ai-rules` 远程仓库安装规则包了。下一阶段建议做 **Phase 3：template/block 渲染 + Cursor/Copilot/Claude 适配增强**。
