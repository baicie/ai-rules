下面给 **Phase 5：Registry / Search / Named Pack Alias** 的详细设计与完整代码。

Phase 5 的目标是让用户从：

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

升级成：

```bash
airules add @baicie/react-shadcn
airules search shadcn
airules registry list
```

核心能力：

```txt
1. registry.json 规则包索引
2. named pack alias 解析
3. search 命令
4. registry list 命令
5. config 支持 registries
6. add/update/diff 支持先解析 registry alias 再安装
7. lockfile/config 保存 resolved source，而不是只保存 alias
```

---

# Phase 5 设计

## 1. Registry 定位

Registry 只做 **索引**，不存规则内容。

```txt
registry.json
  记录 pack 名称、source、版本、描述、标签、别名。

pack source
  仍然是 Phase 1/2 已支持的 local/github source。
```

示例：

```json
{
  "$schema": "https://baicie.github.io/airules/schema/registry.schema.json",
  "name": "@baicie/default",
  "version": "0.1.0",
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "version": "0.1.0",
      "description": "React + shadcn/ui AI coding rules",
      "tags": ["react", "shadcn", "tailwind", "frontend"],
      "aliases": ["react-shadcn", "shadcn"]
    }
  ]
}
```

---

## 2. Config 新增 registries

`.agents/agent/airules.config.ts`：

```ts
export default {
  version: 1,
  registries: [
    {
      name: 'baicie',
      source: 'github:baicie/ai-rules/registry.json#main',
    },
  ],
  packs: [],
  install: {
    conflict: 'warn',
  },
  security: {
    trustedSources: ['github:baicie/ai-rules'],
    allowScripts: false,
    requirePinnedVersion: false,
  },
}
```

默认 registry：

```txt
github:baicie/ai-rules/registry.json#main
```

---

## 3. Source 解析规则

Phase 5 后，`airules add <source>` 的 `<source>` 有两类：

```txt
直接 source
  ./packs/react-shadcn
  local:./packs/react-shadcn
  github:baicie/ai-rules/packs/react-shadcn#v0.1.0

named source
  @baicie/react-shadcn
  react-shadcn
  shadcn
```

解析流程：

```txt
1. 判断是不是 direct source。
2. direct source 直接安装。
3. named source 查询 registries。
4. 找到 pack entry 后，用 entry.source 继续安装。
5. config 写回时保留 name + source，避免后续 update 依赖 registry 在线可用。
```

---

# 1. 修改 `packages/schema/src/types.ts`

```ts
export type BuiltinAgentName =
  | 'codex'
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'generic'
  | 'skill'

export type AgentName = BuiltinAgentName | (string & {})

export type InstallMode = 'modules' | 'template' | 'file' | 'directory'

export type MergeStrategy =
  | 'managed-block'
  | 'overwrite-managed'
  | 'skip-if-exists'
  | 'manual'

export type Placement =
  | {
      type: 'append'
    }
  | {
      type: 'prepend'
    }
  | {
      type: 'after-heading'
      heading: string
      fallback?: 'append' | 'prepend' | 'error'
    }
  | {
      type: 'before-heading'
      heading: string
      fallback?: 'append' | 'prepend' | 'error'
    }
  | {
      type: 'replace-file'
    }

export interface AirulesProfile {
  description?: string
  extends?: string
  installs?: string[]
  variables?: Record<string, unknown>
}

export interface AirulesInstall {
  id: string
  agent: AgentName
  target: string
  mode: InstallMode

  placement?: Placement
  merge?: MergeStrategy

  concat?: string[]
  blocks?: string[]

  template?: string
  from?: string
}

export interface AirulesPack {
  $schema?: string
  name: string
  version: string
  description?: string
  license?: string
  keywords?: string[]

  engines?: {
    airules?: string
  }

  profiles?: Record<string, AirulesProfile>

  modules?: Record<string, string>
  blocks?: Record<string, string>

  installs: AirulesInstall[]

  detect?: {
    files?: string[]
    packageJson?: {
      dependencies?: string[]
      devDependencies?: string[]
    }
  }
}

export interface AirulesRegistryRef {
  name?: string
  source: string
}

export interface AirulesRegistryPack {
  name: string
  source: string
  version?: string
  description?: string
  tags?: string[]
  aliases?: string[]
  deprecated?: boolean | string
  homepage?: string
}

export interface AirulesRegistry {
  $schema?: string
  name?: string
  version?: string
  description?: string
  packs: AirulesRegistryPack[]
}

export interface AirulesConfigPack {
  name?: string
  source: string
  profile?: string
  agents?: AgentName[]
  variables?: Record<string, unknown>
}

export interface AirulesConfig {
  $schema?: string
  version: 1

  registries?: AirulesRegistryRef[]

  packs: AirulesConfigPack[]

  install?: {
    defaultPlacement?: Placement
    conflict?: 'warn' | 'error' | 'stage' | 'overwrite'
  }

  security?: {
    trustedSources?: string[]
    allowScripts?: boolean
    requirePinnedVersion?: boolean
  }
}

export type AirulesResolvedSource =
  | {
      type: 'local'
      path: string
    }
  | {
      type: 'github'
      owner: string
      repo: string
      path: string
      ref?: string
      commit?: string
    }
  | {
      type: 'npm'
      packageName: string
      version?: string
    }

export interface AirulesLockPack {
  name: string
  version: string
  source: string
  resolved: AirulesResolvedSource
  profile?: string
  agents?: AgentName[]
  hash: string
}

export interface AirulesLockInstallFile {
  target: string
  contentHash: string
}

export interface AirulesLockInstall {
  pack: string
  installId: string
  agent: AgentName
  target: string
  mode: InstallMode
  merge?: MergeStrategy
  modules?: string[]
  blocks?: string[]
  files?: AirulesLockInstallFile[]
  contentHash: string
  managedBlockId?: string
}

export interface AirulesLockfile {
  lockfileVersion: 1
  generatedAt: string
  airulesVersion: string
  packs: AirulesLockPack[]
  installs: AirulesLockInstall[]
}
```

---

# 2. 修改 `packages/schema/src/schema.ts`

```ts
import { z } from 'zod/v3'

export const PlacementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('append'),
  }),
  z.object({
    type: z.literal('prepend'),
  }),
  z.object({
    type: z.literal('after-heading'),
    heading: z.string().min(1),
    fallback: z.enum(['append', 'prepend', 'error']).optional(),
  }),
  z.object({
    type: z.literal('before-heading'),
    heading: z.string().min(1),
    fallback: z.enum(['append', 'prepend', 'error']).optional(),
  }),
  z.object({
    type: z.literal('replace-file'),
  }),
])

export const AgentNameSchema = z.string().min(1)

export const InstallModeSchema = z.enum([
  'modules',
  'template',
  'file',
  'directory',
])

export const MergeStrategySchema = z.enum([
  'managed-block',
  'overwrite-managed',
  'skip-if-exists',
  'manual',
])

export const AirulesProfileSchema = z.object({
  description: z.string().optional(),
  extends: z.string().optional(),
  installs: z.array(z.string().min(1)).optional(),
  variables: z.record(z.unknown()).optional(),
})

export const AirulesInstallSchema = z
  .object({
    id: z.string().min(1),
    agent: AgentNameSchema,
    target: z.string().min(1),
    mode: InstallModeSchema,

    placement: PlacementSchema.optional(),
    merge: MergeStrategySchema.optional(),

    concat: z.array(z.string().min(1)).optional(),
    blocks: z.array(z.string().min(1)).optional(),

    template: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
  })
  .superRefine((install, ctx) => {
    if (install.mode === 'modules' && !install.concat?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'modules mode requires non-empty concat',
        path: ['concat'],
      })
    }

    if (install.mode === 'template' && !install.template) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'template mode requires template',
        path: ['template'],
      })
    }

    if (
      (install.mode === 'file' || install.mode === 'directory') &&
      !install.from
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${install.mode} mode requires from`,
        path: ['from'],
      })
    }
  })

export const AirulesPackSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),

  engines: z
    .object({
      airules: z.string().optional(),
    })
    .optional(),

  profiles: z.record(AirulesProfileSchema).optional(),

  modules: z.record(z.string().min(1)).optional(),
  blocks: z.record(z.string().min(1)).optional(),

  installs: z.array(AirulesInstallSchema).min(1),

  detect: z
    .object({
      files: z.array(z.string()).optional(),
      packageJson: z
        .object({
          dependencies: z.array(z.string()).optional(),
          devDependencies: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
})

export const AirulesRegistryRefSchema = z.object({
  name: z.string().optional(),
  source: z.string().min(1),
})

export const AirulesRegistryPackSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  deprecated: z.union([z.boolean(), z.string()]).optional(),
  homepage: z.string().optional(),
})

export const AirulesRegistrySchema = z.object({
  $schema: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  packs: z.array(AirulesRegistryPackSchema),
})

export const AirulesConfigPackSchema = z.object({
  name: z.string().optional(),
  source: z.string().min(1),
  profile: z.string().optional(),
  agents: z.array(AgentNameSchema).optional(),
  variables: z.record(z.unknown()).optional(),
})

export const AirulesConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),

  registries: z.array(AirulesRegistryRefSchema).optional(),

  packs: z.array(AirulesConfigPackSchema),

  install: z
    .object({
      defaultPlacement: PlacementSchema.optional(),
      conflict: z.enum(['warn', 'error', 'stage', 'overwrite']).optional(),
    })
    .optional(),

  security: z
    .object({
      trustedSources: z.array(z.string()).optional(),
      allowScripts: z.boolean().optional(),
      requirePinnedVersion: z.boolean().optional(),
    })
    .optional(),
})

export const AirulesResolvedSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('local'),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal('github'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    path: z.string(),
    ref: z.string().optional(),
    commit: z.string().optional(),
  }),
  z.object({
    type: z.literal('npm'),
    packageName: z.string().min(1),
    version: z.string().optional(),
  }),
])

export const AirulesLockPackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  resolved: AirulesResolvedSourceSchema,
  profile: z.string().optional(),
  agents: z.array(AgentNameSchema).optional(),
  hash: z.string().min(1),
})

export const AirulesLockInstallFileSchema = z.object({
  target: z.string().min(1),
  contentHash: z.string().min(1),
})

export const AirulesLockInstallSchema = z.object({
  pack: z.string().min(1),
  installId: z.string().min(1),
  agent: AgentNameSchema,
  target: z.string().min(1),
  mode: InstallModeSchema,
  merge: MergeStrategySchema.optional(),
  modules: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  files: z.array(AirulesLockInstallFileSchema).optional(),
  contentHash: z.string().min(1),
  managedBlockId: z.string().optional(),
})

export const AirulesLockfileSchema = z.object({
  lockfileVersion: z.literal(1),
  generatedAt: z.string().min(1),
  airulesVersion: z.string().min(1),
  packs: z.array(AirulesLockPackSchema),
  installs: z.array(AirulesLockInstallSchema),
})
```

---

# 3. 新增 `packages/core/src/registry.ts`

```ts
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
  return (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('local:') ||
    source.startsWith('file://') ||
    source.startsWith('github:') ||
    source.startsWith('npm:') ||
    source.startsWith('http://') ||
    source.startsWith('https://')
  )
}

export async function resolvePackAlias(
  options: ResolvePackAliasOptions,
): Promise<ResolvedPackAlias> {
  if (isDirectPackSource(options.source)) {
    return {
      input: options.source,
      source: options.source,
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
  if (registrySource) {
    return [
      {
        source: registrySource,
      },
    ]
  }

  if (config?.registries?.length) {
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

  const localPath = localSource.startsWith('file://')
    ? new URL(localSource)
    : localSource

  if (localPath instanceof URL) {
    return readFileSync(localPath, 'utf8')
  }

  const absolutePath = isAbsolute(localPath)
    ? localPath
    : resolve(cwd, localPath)

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
    process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.length > 0
      ? process.env.GITHUB_TOKEN
      : process.env.GH_TOKEN

  if (token && token.length > 0) {
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
```

---

# 4. 修改 `packages/core/src/security.ts`

新增：registry alias 解析后，安全校验应该针对 **resolved source**。

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

# 5. 修改 `packages/core/src/index.ts`

```ts
export * from './config-loader'
export * from './config-writer'
export * from './constants'
export * from './doctor'
export * from './github-source'
export * from './hash'
export * from './install-renderer'
export * from './installer'
export * from './lockfile'
export * from './managed-block'
export * from './module-renderer'
export * from './pack-loader'
export * from './path-utils'
export * from './profile'
export * from './prune'
export * from './registry'
export * from './remove'
export * from './security'
export * from './source'
export * from './template-renderer'
```

---

# 6. 修改 `packages/cli/src/commands/add.ts`

```ts
import type { AgentName, AirulesConfig } from '@baicie/airules-schema'
import {
  installPack,
  loadAirulesConfigSync,
  resolvePackAlias,
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
  registry?: string
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const agents = parseAgentList(options.agent)
  const config = loadConfigOrCreateEmpty(options.cwd)

  const resolvedAlias = await resolvePackAlias({
    cwd: options.cwd,
    source: options.source,
    config,
    registrySource: options.registry,
  })

  const securityResult = validateSourceSecurity(
    resolvedAlias.source,
    config.security,
  )

  for (const warning of securityResult.warnings) {
    console.warn(`warning: ${warning}`)
  }

  const result = await installPack({
    cwd: options.cwd,
    source: resolvedAlias.source,
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(agents !== undefined ? { agents } : {}),
    dryRun: options.dryRun === true,
  })

  printInstallSummary(result.operations, options.dryRun === true)

  if (!options.dryRun && options.save !== false) {
    const nextConfig = upsertConfigPack(config, {
      name: resolvedAlias.name ?? result.packName,
      source: resolvedAlias.source,
      ...(options.profile !== undefined ? { profile: options.profile } : {}),
      ...(agents !== undefined ? { agents } : {}),
    })

    writeAirulesConfig(options.cwd, nextConfig)
    console.info(`Saved pack config for ${result.packName}.`)
  }
}

function parseAgentList(agent: string | undefined): AgentName[] | undefined {
  if (!agent) {
    return undefined
  }

  const agents: AgentName[] = []
  for (const item of agent.split(',')) {
    const trimmed = item.trim()
    if (trimmed.length > 0) {
      agents.push(trimmed as AgentName)
    }
  }

  return agents.length > 0 ? agents : undefined
}

function loadConfigOrCreateEmpty(cwd: string): AirulesConfig {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return {
      version: 1,
      registries: [
        {
          name: 'default',
          source: 'github:baicie/ai-rules/registry.json#main',
        },
      ],
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

# 7. 修改 `packages/cli/src/commands/init.ts`

让初始化配置默认带 registries。

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AIRULES_AGENT_DIR,
  AIRULES_CACHE_DIRNAME,
  AIRULES_LOCK_FILENAME,
  AIRULES_STAGED_DIRNAME,
  AIRULES_STATE_FILENAME,
} from '@baicie/airules-core'

export interface InitCommandOptions {
  cwd: string
  force?: boolean
}

export async function runInitCommand(
  options: InitCommandOptions,
): Promise<void> {
  const agentDir = join(options.cwd, AIRULES_AGENT_DIR)
  const cacheDir = join(agentDir, AIRULES_CACHE_DIRNAME)
  const stagedDir = join(agentDir, AIRULES_STAGED_DIRNAME)

  mkdirSync(agentDir, {
    recursive: true,
  })

  mkdirSync(cacheDir, {
    recursive: true,
  })

  mkdirSync(stagedDir, {
    recursive: true,
  })

  writeFileIfAllowed(
    join(agentDir, 'airules.config.ts'),
    createDefaultConfig(),
    options.force,
  )

  writeFileIfAllowed(
    join(agentDir, AIRULES_LOCK_FILENAME),
    createEmptyLockfile(),
    options.force,
  )

  writeFileIfAllowed(
    join(agentDir, AIRULES_STATE_FILENAME),
    JSON.stringify(
      {
        version: 1,
        initializedAt: new Date().toISOString(),
      },
      null,
      2,
    ).concat('\n'),
    options.force,
  )

  console.info(`Initialized airules under ${AIRULES_AGENT_DIR}`)
}

function writeFileIfAllowed(
  filePath: string,
  content: string,
  force = false,
): void {
  if (existsSync(filePath) && !force) {
    const existing = readFileSync(filePath, 'utf8')
    if (existing.length > 0) {
      console.info(`Skipped existing file: ${filePath}`)
      return
    }
  }

  writeFileSync(filePath, content)
  console.info(`Created file: ${filePath}`)
}

function createDefaultConfig(): string {
  return `// airules config (v1)
export default {
  version: 1,
  registries: [
    {
      name: 'default',
      source: 'github:baicie/ai-rules/registry.json#main',
    },
  ],
  packs: [],
  install: {
    conflict: 'warn',
  },
  security: {
    trustedSources: ['github:baicie/ai-rules'],
    allowScripts: false,
    requirePinnedVersion: false,
  },
}
`
}

function createEmptyLockfile(): string {
  return JSON.stringify(
    {
      lockfileVersion: 1,
      generatedAt: new Date().toISOString(),
      airulesVersion: '0.0.0',
      packs: [],
      installs: [],
    },
    null,
    2,
  ).concat('\n')
}
```

---

# 8. 新增 `packages/cli/src/commands/search.ts`

```ts
import { loadAirulesConfigSync, searchRegistries } from '@baicie/airules-core'

export interface SearchCommandOptions {
  cwd: string
  query?: string
  registry?: string
}

export async function runSearchCommand(
  options: SearchCommandOptions,
): Promise<void> {
  const config = loadConfigOrUndefined(options.cwd)
  const results = await searchRegistries({
    cwd: options.cwd,
    query: options.query,
    config,
    registrySource: options.registry,
  })

  if (results.length === 0) {
    console.info('No airules packs found.')
    return
  }

  console.info('airules search')

  for (const result of results) {
    const pack = result.pack
    const deprecated = pack.deprecated
      ? ` deprecated=${String(pack.deprecated)}`
      : ''

    console.info(
      `- ${pack.name}${pack.version ? `@${pack.version}` : ''}${deprecated}`,
    )
    console.info(`  source: ${pack.source}`)

    if (pack.description) {
      console.info(`  description: ${pack.description}`)
    }

    if (pack.tags?.length) {
      console.info(`  tags: ${pack.tags.join(', ')}`)
    }

    if (pack.aliases?.length) {
      console.info(`  aliases: ${pack.aliases.join(', ')}`)
    }

    console.info(`  registry: ${result.registry}`)
  }
}

function loadConfigOrUndefined(cwd: string) {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return undefined
  }
}
```

---

# 9. 新增 `packages/cli/src/commands/registry.ts`

```ts
import {
  loadAirulesConfigSync,
  loadConfiguredRegistries,
} from '@baicie/airules-core'

export interface RegistryListCommandOptions {
  cwd: string
  registry?: string
}

export async function runRegistryListCommand(
  options: RegistryListCommandOptions,
): Promise<void> {
  const config = loadConfigOrUndefined(options.cwd)
  const registries = await loadConfiguredRegistries({
    cwd: options.cwd,
    config,
    registrySource: options.registry,
  })

  console.info('airules registries')

  for (const item of registries) {
    console.info(`- ${item.registry.name ?? item.ref.name ?? 'registry'}`)
    console.info(`  source: ${item.ref.source}`)
    if (item.registry.version) {
      console.info(`  version: ${item.registry.version}`)
    }
    console.info(`  packs: ${item.registry.packs.length}`)
  }
}

function loadConfigOrUndefined(cwd: string) {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return undefined
  }
}
```

---

# 10. 修改 `packages/cli/src/bin.ts`

增加 `search` 和 `registry list`，并给 `add/search/registry list` 加 `--registry`。

```ts
#!/usr/bin/env node
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { runAddCommand } from './commands/add'
import { runDiffCommand } from './commands/diff'
import { runDoctorCommand } from './commands/doctor'
import { runInitCommand } from './commands/init'
import { runListCommand } from './commands/list'
import { runPruneCommand } from './commands/prune'
import { runRegistryListCommand } from './commands/registry'
import { runRemoveCommand } from './commands/remove'
import { runSearchCommand } from './commands/search'
import { runUpdateCommand } from './commands/update'

export function runCli(argv = process.argv): void {
  const cli = cac('airules')

  cli
    .command('init', 'Initialize airules in the current repository')
    .option('--force', 'Overwrite existing config and lock files')
    .action(async (options: { force?: boolean }) => {
      await runInitCommand({
        cwd: process.cwd(),
        force: Boolean(options.force),
      })
    })

  cli
    .command('add <source>', 'Install an airules pack')
    .option('--profile <profile>', 'Profile name')
    .option('--agent <agents>', 'Comma-separated agent names')
    .option('--registry <registry>', 'Override registry source for named packs')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--no-save', 'Do not save the pack into airules config')
    .action(
      async (
        source: string,
        options: {
          profile?: string
          agent?: string
          registry?: string
          dryRun?: boolean
          save?: boolean
        },
      ) => {
        await runAddCommand({
          cwd: process.cwd(),
          source,
          profile: options.profile,
          agent: options.agent,
          registry: options.registry,
          dryRun: Boolean(options.dryRun),
          save: options.save,
        })
      },
    )

  cli
    .command('search [query]', 'Search configured airules registries')
    .option('--registry <registry>', 'Override registry source')
    .action(
      async (
        query: string | undefined,
        options: {
          registry?: string
        },
      ) => {
        await runSearchCommand({
          cwd: process.cwd(),
          query,
          registry: options.registry,
        })
      },
    )

  cli
    .command('registry list', 'List configured airules registries')
    .option('--registry <registry>', 'Override registry source')
    .action(async (options: { registry?: string }) => {
      await runRegistryListCommand({
        cwd: process.cwd(),
        registry: options.registry,
      })
    })

  cli
    .command('update [name]', 'Reinstall configured airules packs')
    .option('--dry-run', 'Preview changes without writing files')
    .action(async (name: string | undefined, options: { dryRun?: boolean }) => {
      await runUpdateCommand({
        cwd: process.cwd(),
        name,
        dryRun: Boolean(options.dryRun),
      })
    })

  cli
    .command('diff [name]', 'Preview configured airules pack changes')
    .action(async (name: string | undefined) => {
      await runDiffCommand({
        cwd: process.cwd(),
        name,
      })
    })

  cli
    .command('remove <pack>', 'Remove an installed airules pack')
    .option('--dry-run', 'Preview removal without writing files')
    .option('--force', 'Remove generated files even if they were modified')
    .action(
      async (
        pack: string,
        options: {
          dryRun?: boolean
          force?: boolean
        },
      ) => {
        await runRemoveCommand({
          cwd: process.cwd(),
          pack,
          dryRun: Boolean(options.dryRun),
          force: Boolean(options.force),
        })
      },
    )

  cli
    .command('prune', 'Prune stale airules lock entries')
    .option('--dry-run', 'Preview prune without writing lockfile')
    .action(async (options: { dryRun?: boolean }) => {
      await runPruneCommand({
        cwd: process.cwd(),
        dryRun: Boolean(options.dryRun),
      })
    })

  cli.command('doctor', 'Check airules configuration').action(async () => {
    await runDoctorCommand({
      cwd: process.cwd(),
    })
  })

  cli
    .command('list', 'List installed airules packs from lockfile')
    .action(async () => {
      await runListCommand({
        cwd: process.cwd(),
      })
    })

  cli.help()
  cli.version('0.0.0')
  cli.parse(argv)
}

function isCliEntry(metaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    return false
  }

  return fileURLToPath(metaUrl) === resolve(argv1)
}

if (isCliEntry(import.meta.url, process.argv[1])) {
  runCli()
}
```

---

# 11. 新增根目录 `registry.json`

```json
{
  "$schema": "https://baicie.github.io/airules/schema/registry.schema.json",
  "name": "@baicie/default",
  "version": "0.1.0",
  "description": "Default airules registry",
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "version": "0.1.0",
      "description": "React + shadcn/ui AI coding rules",
      "tags": ["react", "shadcn", "tailwind", "frontend"],
      "aliases": ["react-shadcn", "shadcn"]
    },
    {
      "name": "@baicie/ts-monorepo",
      "source": "github:baicie/ai-rules/packs/ts-monorepo#v0.1.0",
      "version": "0.1.0",
      "description": "TypeScript monorepo AI coding rules",
      "tags": ["typescript", "monorepo", "pnpm"],
      "aliases": ["ts-monorepo", "monorepo"]
    }
  ]
}
```

---

# 12. 单元测试

## `packages/schema/src/registry.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { AirulesConfigSchema, AirulesRegistrySchema } from './index'

describe('AirulesRegistrySchema', () => {
  it('parses registry', () => {
    const registry = {
      name: '@baicie/default',
      version: '0.1.0',
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
          version: '0.1.0',
          description: 'React shadcn rules',
          tags: ['react', 'shadcn'],
          aliases: ['react-shadcn', 'shadcn'],
        },
      ],
    }

    expect(AirulesRegistrySchema.parse(registry)).toEqual(registry)
  })

  it('rejects registry pack without source', () => {
    expect(() =>
      AirulesRegistrySchema.parse({
        packs: [
          {
            name: '@baicie/react-shadcn',
          },
        ],
      }),
    ).toThrow()
  })
})

describe('AirulesConfigSchema registries', () => {
  it('parses config registries', () => {
    const config = {
      version: 1,
      registries: [
        {
          name: 'default',
          source: './registry.json',
        },
      ],
      packs: [],
    }

    expect(AirulesConfigSchema.parse(config)).toEqual(config)
  })
})
```

---

## `packages/core/src/registry.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isDirectPackSource,
  loadRegistry,
  resolvePackAlias,
  resolveRegistryRefs,
  searchRegistries,
} from './registry'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-registry-'))
  return currentTmpDir
}

function writeRegistry(cwd: string): void {
  writeFileSync(
    join(cwd, 'registry.json'),
    JSON.stringify(
      {
        name: '@baicie/default',
        version: '0.1.0',
        packs: [
          {
            name: '@baicie/react-shadcn',
            source: './packs/react-shadcn',
            version: '0.1.0',
            description: 'React shadcn rules',
            tags: ['react', 'shadcn'],
            aliases: ['react-shadcn', 'shadcn'],
          },
          {
            name: '@baicie/java-spring',
            source: './packs/java-spring',
            version: '0.1.0',
            description: 'Java Spring rules',
            tags: ['java', 'spring'],
            aliases: ['spring'],
          },
        ],
      },
      null,
      2,
    ),
  )
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

describe('isDirectPackSource', () => {
  it('detects direct sources', () => {
    expect(isDirectPackSource('./packs/a')).toBe(true)
    expect(isDirectPackSource('local:./packs/a')).toBe(true)
    expect(isDirectPackSource('github:baicie/ai-rules/packs/a#main')).toBe(true)
    expect(isDirectPackSource('@baicie/react-shadcn')).toBe(false)
    expect(isDirectPackSource('react-shadcn')).toBe(false)
  })
})

describe('loadRegistry', () => {
  it('loads local registry', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const registry = await loadRegistry({
      cwd,
      source: './registry.json',
    })

    expect(registry.name).toBe('@baicie/default')
    expect(registry.packs).toHaveLength(2)
  })

  it('loads http registry', async () => {
    vi.stubGlobal('fetch', async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            packs: [
              {
                name: '@baicie/react-shadcn',
                source: './packs/react-shadcn',
              },
            ],
          }),
      } as Response
    })

    const registry = await loadRegistry({
      cwd: process.cwd(),
      source: 'https://example.com/registry.json',
    })

    expect(registry.packs[0]?.name).toBe('@baicie/react-shadcn')
  })
})

describe('resolveRegistryRefs', () => {
  it('uses explicit registry first', () => {
    expect(
      resolveRegistryRefs(
        {
          version: 1,
          registries: [
            {
              source: './registry.json',
            },
          ],
          packs: [],
        },
        './custom.json',
      ),
    ).toEqual([
      {
        source: './custom.json',
      },
    ])
  })

  it('uses config registries', () => {
    expect(
      resolveRegistryRefs(
        {
          version: 1,
          registries: [
            {
              name: 'local',
              source: './registry.json',
            },
          ],
          packs: [],
        },
        undefined,
      ),
    ).toEqual([
      {
        name: 'local',
        source: './registry.json',
      },
    ])
  })
})

describe('resolvePackAlias', () => {
  it('returns direct source unchanged', async () => {
    const result = await resolvePackAlias({
      cwd: process.cwd(),
      source: './packs/react-shadcn',
    })

    expect(result.source).toBe('./packs/react-shadcn')
    expect(result.name).toBeUndefined()
  })

  it('resolves pack by name', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const result = await resolvePackAlias({
      cwd,
      source: '@baicie/react-shadcn',
      registrySource: './registry.json',
    })

    expect(result.name).toBe('@baicie/react-shadcn')
    expect(result.source).toBe('./packs/react-shadcn')
  })

  it('resolves pack by alias', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const result = await resolvePackAlias({
      cwd,
      source: 'shadcn',
      registrySource: './registry.json',
    })

    expect(result.name).toBe('@baicie/react-shadcn')
    expect(result.source).toBe('./packs/react-shadcn')
  })

  it('throws when alias is missing', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    await expect(
      resolvePackAlias({
        cwd,
        source: 'missing',
        registrySource: './registry.json',
      }),
    ).rejects.toThrow(/Cannot resolve airules pack/)
  })
})

describe('searchRegistries', () => {
  it('searches registry packs by tag and alias', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const results = await searchRegistries({
      cwd,
      query: 'shadcn',
      registrySource: './registry.json',
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.pack.name).toBe('@baicie/react-shadcn')
  })

  it('returns all packs when query is empty', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const results = await searchRegistries({
      cwd,
      registrySource: './registry.json',
    })

    expect(results.map(item => item.pack.name)).toEqual([
      '@baicie/java-spring',
      '@baicie/react-shadcn',
    ])
  })
})
```

---

## `packages/cli/src/commands/search.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSearchCommand } from './search'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-search-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      registries: [
        {
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
          description: 'React shadcn rules',
          tags: ['react', 'shadcn'],
          aliases: ['shadcn'],
        },
      ],
    }),
  )

  return currentTmpDir
}

afterEach(() => {
  vi.restoreAllMocks()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('runSearchCommand', () => {
  it('prints registry search results', async () => {
    const cwd = createProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runSearchCommand({
      cwd,
      query: 'shadcn',
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('@baicie/react-shadcn')
    expect(output).toContain('React shadcn rules')
  })
})
```

---

## `packages/cli/src/commands/registry.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRegistryListCommand } from './registry'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-registry-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      registries: [
        {
          name: 'local',
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      name: '@baicie/default',
      version: '0.1.0',
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
        },
      ],
    }),
  )

  return currentTmpDir
}

afterEach(() => {
  vi.restoreAllMocks()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('runRegistryListCommand', () => {
  it('prints configured registries', async () => {
    const cwd = createProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runRegistryListCommand({
      cwd,
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('@baicie/default')
    expect(output).toContain('packs: 1')
  })
})
```

---

## `packages/cli/src/commands/add-registry.test.ts`

```ts
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runAddCommand } from './add'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-add-registry-'))

  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/modules'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      registries: [
        {
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
          aliases: ['shadcn'],
        },
      ],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/airules.pack.json'),
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
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/core.md'),
    '## Core\n\n- From registry alias.\n',
  )

  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('runAddCommand with registry alias', () => {
  it('resolves alias and installs pack', async () => {
    const cwd = createProject()

    await runAddCommand({
      cwd,
      source: 'shadcn',
      agent: 'codex',
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true)
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain(
      'From registry alias',
    )

    const config = readFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      'utf8',
    )

    expect(config).toContain('@baicie/react-shadcn')
    expect(config).toContain('./packs/react-shadcn')
  })
})
```

---

# 13. 新增 `docs/phase5.md`

````md
# Phase 5 Design

## Goal

Phase 5 adds registry and named pack alias support.

Before Phase 5:

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```
````

After Phase 5:

```bash
airules add @baicie/react-shadcn
airules add shadcn
airules search shadcn
airules registry list
```

## Registry file

```json
{
  "name": "@baicie/default",
  "version": "0.1.0",
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "version": "0.1.0",
      "description": "React + shadcn/ui AI coding rules",
      "tags": ["react", "shadcn"],
      "aliases": ["react-shadcn", "shadcn"]
    }
  ]
}
```

## Config

```ts
export default {
  version: 1,
  registries: [
    {
      name: 'default',
      source: 'github:baicie/ai-rules/registry.json#main',
    },
  ],
  packs: [],
}
```

## Commands

```bash
airules search
airules search shadcn
airules registry list
airules add @baicie/react-shadcn
airules add shadcn
airules add shadcn --registry ./registry.json
```

## Source resolution

Direct sources are installed as-is:

```txt
./packs/react-shadcn
local:./packs/react-shadcn
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

Named sources are resolved from registries:

```txt
@baicie/react-shadcn
react-shadcn
shadcn
```

## Security

Security checks are applied to the resolved pack source, not the alias.

For example:

```bash
airules add shadcn
```

If `shadcn` resolves to:

```txt
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

Then `security.requirePinnedVersion` and `security.trustedSources` are checked against that GitHub source.

## Config writeback

When adding from alias, config stores the resolved source:

```json
{
  "name": "@baicie/react-shadcn",
  "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0"
}
```

This makes future `airules update` independent from registry availability.

````

---

# 14. 验证命令

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

node packages/cli/dist/bin.js init --force
node packages/cli/dist/bin.js search shadcn
node packages/cli/dist/bin.js registry list
node packages/cli/dist/bin.js add shadcn --agent codex --dry-run
node packages/cli/dist/bin.js add @baicie/react-shadcn --agent codex
node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js doctor
```

---

# Phase 5 验收标准

```txt
1. registry.json schema 校验通过。
2. config 支持 registries。
3. airules search 能搜索本地 registry。
4. airules registry list 能列出 registry。
5. airules add @baicie/react-shadcn 能解析 registry 并安装。
6. airules add shadcn 能通过 aliases 安装。
7. add alias 后 config 写入 resolved source。
8. direct source 不经过 registry，保持原行为。
9. registry 支持 local / http / github raw 读取。
10. security 校验发生在 resolved source 上。
```

---

# 建议提交信息

```txt
feat: add phase5 registry and named pack resolution
```

Phase 5 做完后，`airules` 的使用体验就顺了：

```bash
airules init
airules search shadcn
airules add shadcn --agent codex,cursor
airules update
airules doctor
airules remove @baicie/react-shadcn
```

下一阶段建议做 **Phase 6：npm source / registry publish / pack validate / pack build**，让规则包可以发布成 npm 包，也能在 CI 中校验 registry 和 pack 的一致性。
