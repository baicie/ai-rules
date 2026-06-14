下面给 **Phase 3：Block + Template 渲染 + File/Directory 安装 + Skill 目录分发** 的完整设计与代码。

当前代码里的协议层已经预留了 Phase 3 所需字段：`InstallMode` 已包含 `modules | template | file | directory`，`AirulesInstall` 也已经有 `concat / blocks / template / from` 字段。
当前 schema 也已经校验了 `template` 需要 `template` 字段，`file/directory` 需要 `from` 字段，所以 Phase 3 不需要推翻协议，只需要实现安装引擎。
当前 installer 仍然只允许 `modules + managed-block`，非 modules 会直接报错，这是 Phase 3 要移除的核心限制。

---

# Phase 3 目标

## 支持范围

```txt
1. template mode
   - 读取 templates/*.hbs
   - 支持 {{block "id"}}
   - 支持 {{block:id}}
   - 支持 {{variable}}
   - 支持 {{#if variable}}...{{/if}}

2. block 渲染
   - 读取 pack.blocks
   - 可被 template 复用
   - variables 支持来自 profile.variables + config.variables

3. file mode
   - 复制单文件到目标文件
   - 默认 merge = overwrite-managed
   - 不往文件头插 HTML 注释，避免破坏 .mdc / SKILL.md frontmatter

4. directory mode
   - 复制目录到目标目录
   - 适合安装 .agents/skills/*
   - 默认 merge = overwrite-managed

5. overwrite-managed
   - 依赖 lockfile 中的 per-file hash 判断目标是否由 airules 管理
   - 不污染目标文件内容

6. skip-if-exists
   - 目标已存在则跳过

7. manual
   - 写入 .agents/agent/staged，不直接覆盖目标

8. lockfile 增强
   - install entry 增加 files: [{ target, contentHash }]
```

---

# 为什么不用文件头 managed marker

之前我们讨论过 `overwrite-managed` 可以在文件顶部写：

```md
<!-- airules:managed ... -->
```

但 Phase 3 不建议这么做，因为：

```txt
1. .cursor/rules/*.mdc 可能要求 YAML frontmatter 位于文件开头。
2. SKILL.md 通常也要求 frontmatter 位于文件开头。
3. 在文件头插 HTML 注释可能破坏 agent / editor 的解析。
```

所以 Phase 3 采用：

```txt
文件内容保持原样
是否 managed 通过 .agents/agent/airules.lock.json 的 files hash 判断
```

---

# 1. 修改 `packages/schema/src/types.ts`

只需要增加 per-file lock 类型，并在 `AirulesLockInstall` 上加 `files`。

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

新增 `AirulesLockInstallFileSchema`，并在 lock install 加 `files`。

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

# 3. 新增 `packages/core/src/path-utils.ts`

```ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AIRULES_AGENT_DIR, AIRULES_STAGED_DIRNAME } from './constants'

export function safeResolveInside(
  root: string,
  childPath: string,
  label = 'path',
): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(resolvedRoot, childPath)
  assertInsideDirectory(resolvedRoot, resolvedTarget, label)
  return resolvedTarget
}

export function safeResolveTarget(cwd: string, target: string): string {
  return safeResolveInside(cwd, target, 'target')
}

export function assertInsideDirectory(
  root: string,
  target: string,
  label = 'path',
): void {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const relativePath = relative(resolvedRoot, resolvedTarget)

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to access ${label} outside root: ${target}`)
  }
}

export function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), {
    recursive: true,
  })
}

export function readTextFile(filePath: string): string {
  return readFileSync(filePath, 'utf8')
}

export function listTextFilesRecursively(root: string): string[] {
  const result: string[] = []

  function walk(current: string): void {
    const entries = readdirSync(current)

    for (const entry of entries) {
      const absolutePath = join(current, entry)
      const stat = statSync(absolutePath)

      if (stat.isDirectory()) {
        walk(absolutePath)
        continue
      }

      if (stat.isFile()) {
        result.push(absolutePath)
      }
    }
  }

  if (!existsSync(root)) {
    throw new Error(`Directory does not exist: ${root}`)
  }

  walk(root)
  result.sort()
  return result
}

export function toPosixPath(value: string): string {
  return value.split(sep).join('/')
}

export function joinTarget(base: string, relativePath: string): string {
  return toPosixPath(join(base, relativePath))
}

export function getManualStagedPath(options: {
  cwd: string
  pack: string
  installId: string
  target: string
}): string {
  const safePack = sanitizeSegment(options.pack)
  const safeInstall = sanitizeSegment(options.installId)

  return safeResolveInside(
    options.cwd,
    join(
      AIRULES_AGENT_DIR,
      AIRULES_STAGED_DIRNAME,
      safePack,
      safeInstall,
      options.target,
    ),
    'staged target',
  )
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}
```

---

# 4. 新增 `packages/core/src/template-renderer.ts`

```ts
import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { safeResolveInside, readTextFile } from './path-utils'

export interface RenderTemplateOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
  variables?: Record<string, unknown>
}

export interface RenderTemplateResult {
  content: string
  blockIds: string[]
}

export function renderTemplate(
  options: RenderTemplateOptions,
): RenderTemplateResult {
  if (options.install.mode !== 'template') {
    throw new Error(
      `Install "${options.install.id}" uses mode "${options.install.mode}", expected template.`,
    )
  }

  if (!options.install.template) {
    throw new Error(`Install "${options.install.id}" requires template.`)
  }

  const templatePath = safeResolveInside(
    options.packRoot,
    options.install.template,
    'template',
  )

  const template = readTextFile(templatePath)
  const blockIds = resolveBlockIds(template, options.install.blocks)
  const blocks = readBlocks({
    pack: options.pack,
    packRoot: options.packRoot,
    blockIds,
  })

  const content = renderTemplateString(template, {
    blocks,
    variables: options.variables ?? {},
  })

  return {
    content: ensureTrailingNewline(content),
    blockIds,
  }
}

export function renderTemplateString(
  template: string,
  options: {
    blocks: Record<string, string>
    variables: Record<string, unknown>
  },
): string {
  let output = template

  output = renderIfBlocks(output, options.variables)

  output = output.replace(
    /\{\{\s*block\s+["']([^"']+)["']\s*\}\}/g,
    (_, blockId: string) => {
      return options.blocks[blockId] ?? ''
    },
  )

  output = output.replace(
    /\{\{\s*block:([\w.-]+)\s*\}\}/g,
    (_, blockId: string) => {
      return options.blocks[blockId] ?? ''
    },
  )

  output = output.replace(
    /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g,
    (_, variableName: string) => {
      const value = getVariableValue(options.variables, variableName)
      return value === undefined || value === null ? '' : String(value)
    },
  )

  return output
}

function renderIfBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if\s+([a-zA-Z_][\w.-]*)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, variableName: string, body: string) => {
      return isTruthy(getVariableValue(variables, variableName)) ? body : ''
    },
  )
}

function resolveBlockIds(
  template: string,
  explicitBlockIds: string[] | undefined,
): string[] {
  const result = new Set<string>()

  for (const blockId of explicitBlockIds ?? []) {
    result.add(blockId)
  }

  for (const match of template.matchAll(
    /\{\{\s*block\s+["']([^"']+)["']\s*\}\}/g,
  )) {
    const blockId = match[1]
    if (blockId) {
      result.add(blockId)
    }
  }

  for (const match of template.matchAll(/\{\{\s*block:([\w.-]+)\s*\}\}/g)) {
    const blockId = match[1]
    if (blockId) {
      result.add(blockId)
    }
  }

  return Array.from(result)
}

function readBlocks(options: {
  pack: AirulesPack
  packRoot: string
  blockIds: string[]
}): Record<string, string> {
  const blocks = options.pack.blocks

  if (!blocks && options.blockIds.length > 0) {
    throw new Error(`Pack "${options.pack.name}" does not define blocks.`)
  }

  const result: Record<string, string> = {}

  for (const blockId of options.blockIds) {
    const blockPath = blocks?.[blockId]

    if (!blockPath) {
      throw new Error(
        `Template references missing block "${blockId}" in pack "${options.pack.name}".`,
      )
    }

    const absoluteBlockPath = safeResolveInside(
      options.packRoot,
      blockPath,
      'block',
    )

    result[blockId] = readTextFile(absoluteBlockPath).trim()
  }

  return result
}

function getVariableValue(
  variables: Record<string, unknown>,
  variableName: string,
): unknown {
  const parts = variableName.split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (
      current &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, part)
    ) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

function isTruthy(value: unknown): boolean {
  if (value === false || value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.length > 0
  }

  return Boolean(value)
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`
}
```

---

# 5. 新增 `packages/core/src/install-renderer.ts`

```ts
import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { relative } from 'node:path'
import { sha256 } from './hash'
import { renderModules } from './module-renderer'
import {
  joinTarget,
  listTextFilesRecursively,
  readTextFile,
  safeResolveInside,
  toPosixPath,
} from './path-utils'
import { renderTemplate } from './template-renderer'

export interface RenderInstallOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
  variables?: Record<string, unknown>
}

export interface RenderedInstallFile {
  target: string
  content: string
  contentHash: string
  sourcePath?: string
}

export interface RenderedInstall {
  files: RenderedInstallFile[]
  modules?: string[]
  blocks?: string[]
  contentHash: string
}

export function renderInstall(options: RenderInstallOptions): RenderedInstall {
  switch (options.install.mode) {
    case 'modules':
      return renderModulesInstall(options)

    case 'template':
      return renderTemplateInstall(options)

    case 'file':
      return renderFileInstall(options)

    case 'directory':
      return renderDirectoryInstall(options)

    default: {
      const neverMode: never = options.install.mode
      throw new Error(`Unsupported install mode: ${neverMode}`)
    }
  }
}

function renderModulesInstall(options: RenderInstallOptions): RenderedInstall {
  const rendered = renderModules({
    pack: options.pack,
    packRoot: options.packRoot,
    install: options.install,
  })

  const file = createRenderedFile(options.install.target, rendered.content)

  return {
    files: [file],
    modules: rendered.moduleIds,
    contentHash: hashFiles([file]),
  }
}

function renderTemplateInstall(options: RenderInstallOptions): RenderedInstall {
  const rendered = renderTemplate({
    pack: options.pack,
    packRoot: options.packRoot,
    install: options.install,
    variables: options.variables,
  })

  const file = createRenderedFile(options.install.target, rendered.content)

  return {
    files: [file],
    blocks: rendered.blockIds,
    contentHash: hashFiles([file]),
  }
}

function renderFileInstall(options: RenderInstallOptions): RenderedInstall {
  if (!options.install.from) {
    throw new Error(`Install "${options.install.id}" requires from.`)
  }

  const sourcePath = safeResolveInside(
    options.packRoot,
    options.install.from,
    'file',
  )
  const content = readTextFile(sourcePath)
  const file = createRenderedFile(options.install.target, content, sourcePath)

  return {
    files: [file],
    contentHash: hashFiles([file]),
  }
}

function renderDirectoryInstall(
  options: RenderInstallOptions,
): RenderedInstall {
  if (!options.install.from) {
    throw new Error(`Install "${options.install.id}" requires from.`)
  }

  const sourceRoot = safeResolveInside(
    options.packRoot,
    options.install.from,
    'directory',
  )

  const sourceFiles = listTextFilesRecursively(sourceRoot)
  const files: RenderedInstallFile[] = []

  for (const sourceFile of sourceFiles) {
    const relativePath = toPosixPath(relative(sourceRoot, sourceFile))
    const target = joinTarget(options.install.target, relativePath)
    files.push(createRenderedFile(target, readTextFile(sourceFile), sourceFile))
  }

  if (files.length === 0) {
    throw new Error(
      `Directory install "${options.install.id}" has no files under ${sourceRoot}.`,
    )
  }

  return {
    files,
    contentHash: hashFiles(files),
  }
}

function createRenderedFile(
  target: string,
  content: string,
  sourcePath?: string,
): RenderedInstallFile {
  return {
    target,
    content,
    contentHash: sha256(content),
    ...(sourcePath !== undefined ? { sourcePath } : {}),
  }
}

function hashFiles(files: RenderedInstallFile[]): string {
  const payload = files
    .map(file => `${file.target}\0${file.contentHash}`)
    .join('\0')

  return sha256(payload)
}
```

---

# 6. 替换 `packages/core/src/installer.ts`

```ts
import type {
  AgentName,
  AirulesInstall,
  AirulesLockInstall,
  AirulesLockInstallFile,
  AirulesLockPack,
  AirulesLockfile,
  InstallMode,
  MergeStrategy,
} from '@baicie/airules-schema'
import type { ResolvedPackSource } from './source'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { sha256 } from './hash'
import { renderInstall, type RenderedInstallFile } from './install-renderer'
import {
  readAirulesLockfile,
  upsertLockEntries,
  writeAirulesLockfile,
} from './lockfile'
import { createManagedBlock, upsertManagedBlock } from './managed-block'
import {
  ensureParentDirectory,
  getManualStagedPath,
  safeResolveTarget,
} from './path-utils'
import { loadLocalPack } from './pack-loader'
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
  const profileName = options.profile ?? 'default'
  const profile = resolveProfile(loaded.pack, profileName)
  const variables = {
    ...profile.variables,
    ...(options.variables ?? {}),
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

      lockFiles.push({
        target: renderedFile.target,
        contentHash: operation.contentHash,
      })
    }

    operations.push(...installOperations)

    lockInstallEntries.push({
      pack: loaded.pack.name,
      installId: install.id,
      agent: install.agent,
      target: install.target,
      mode: install.mode,
      merge,
      ...(rendered.modules !== undefined ? { modules: rendered.modules } : {}),
      ...(rendered.blocks !== undefined ? { blocks: rendered.blocks } : {}),
      files: lockFiles,
      contentHash: rendered.contentHash,
      managedBlockId: `airules:${loaded.pack.name}:${install.id}`,
    })
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

function applyRenderedFile(options: {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}): InstallOperation {
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
      throw new Error(`Unsupported merge strategy: ${neverMerge}`)
    }
  }
}

function applyManagedBlockFile(options: {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}): InstallOperation {
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
    contentHash: sha256(nextContent),
  }
}

function applyOverwriteManagedFile(options: {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}): InstallOperation {
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

function applySkipIfExistsFile(options: {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}): InstallOperation {
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

function applyManualFile(options: {
  cwd: string
  packName: string
  packVersion: string
  install: AirulesInstall
  renderedFile: RenderedInstallFile
  merge: MergeStrategy
  lockfile: AirulesLockfile
  dryRun: boolean
}): InstallOperation {
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

export function createDryRunBlockForOperation(
  operation: InstallOperation,
): string {
  return operation.managedBlock ?? operation.nextContent
}
```

---

# 7. 修改 `packages/core/src/index.ts`

```ts
export * from './config-loader'
export * from './config-writer'
export * from './constants'
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
export * from './security'
export * from './source'
export * from './template-renderer'
```

---

# 8. 修改 CLI：`packages/cli/src/commands/add.ts`

只需要确保未来可以传 variables。Phase 3 不加 `--var` CLI，先保持内部支持。

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
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(agents !== undefined ? { agents } : {}),
    dryRun: options.dryRun === true,
  })

  printInstallSummary(result.operations, options.dryRun === true)

  if (options.dryRun === true || options.save === false) {
    return
  }

  const nextConfig = upsertConfigPack(config, {
    name: result.packName,
    source: options.source,
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(agents !== undefined ? { agents } : {}),
  })

  writeAirulesConfig(options.cwd, nextConfig)
  console.info(`Saved pack config for ${result.packName}.`)
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

# 9. 修改 CLI：`packages/cli/src/commands/update.ts`

关键是传入 `pack.variables`。

```ts
import type { AgentName, AirulesConfigPack } from '@baicie/airules-schema'
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

  for (const pack of packs) {
    const securityResult = validateSourceSecurity(pack.source, config.security)
    for (const warning of securityResult.warnings) {
      console.warn(`warning: ${warning}`)
    }
  }

  console.info(options.dryRun ? 'airules update dry-run' : 'airules update')

  for (const pack of packs) {
    await runOne(options.cwd, pack, options.dryRun === true)
  }
}

async function runOne(
  cwd: string,
  pack: AirulesConfigPack,
  dryRun: boolean,
): Promise<void> {
  const result = await installPack({
    cwd,
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined
      ? { agents: pack.agents as AgentName[] }
      : {}),
    ...(pack.variables !== undefined ? { variables: pack.variables } : {}),
    dryRun,
  })

  console.info(`\n${result.packName}@${result.packVersion}`)

  for (const operation of result.operations) {
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
    )
  }
}

function filterPacks(
  packs: AirulesConfigPack[],
  name: string | undefined,
): AirulesConfigPack[] {
  if (!name) {
    return packs
  }

  const filtered: AirulesConfigPack[] = []
  for (const pack of packs) {
    if (pack.name === name || pack.source === name) {
      filtered.push(pack)
    }
  }
  return filtered
}
```

---

# 10. 修改 CLI：`packages/cli/src/commands/diff.ts`

```ts
import type { AirulesConfigPack } from '@baicie/airules-schema'
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

  for (const pack of packs) {
    const securityResult = validateSourceSecurity(pack.source, config.security)
    for (const warning of securityResult.warnings) {
      console.warn(`warning: ${warning}`)
    }
  }

  console.info('airules diff')

  for (const pack of packs) {
    await runOne(options.cwd, pack)
  }
}

async function runOne(cwd: string, pack: AirulesConfigPack): Promise<void> {
  const result = await installPack({
    cwd,
    source: pack.source,
    ...(pack.profile !== undefined ? { profile: pack.profile } : {}),
    ...(pack.agents !== undefined ? { agents: pack.agents } : {}),
    ...(pack.variables !== undefined ? { variables: pack.variables } : {}),
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

    console.info('\nnext content:\n')
    console.info(operation.managedBlock ?? operation.nextContent)
  }
}
```

---

# 11. 单元测试

## `packages/core/src/template-renderer.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AirulesPack } from '@baicie/airules-schema'
import { renderTemplate, renderTemplateString } from './template-renderer'

let currentTmpDir: string | null = null

function createRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-template-'))
  mkdirSync(join(currentTmpDir, 'blocks'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'templates'), { recursive: true })
  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, { recursive: true, force: true })
    currentTmpDir = null
  }
})

describe('renderTemplateString', () => {
  it('renders blocks, variables, and if sections', () => {
    const result = renderTemplateString(
      [
        '# Rules',
        '{{block "core"}}',
        'pm={{packageManager}}',
        '{{#if requireTests}}run tests{{/if}}',
        '{{#if disabled}}hidden{{/if}}',
      ].join('\n'),
      {
        blocks: {
          core: '## Core',
        },
        variables: {
          packageManager: 'pnpm',
          requireTests: true,
          disabled: false,
        },
      },
    )

    expect(result).toContain('## Core')
    expect(result).toContain('pm=pnpm')
    expect(result).toContain('run tests')
    expect(result).not.toContain('hidden')
  })

  it('supports block colon syntax', () => {
    const result = renderTemplateString('{{block:core}}', {
      blocks: {
        core: '## Core',
      },
      variables: {},
    })

    expect(result).toBe('## Core')
  })
})

describe('renderTemplate', () => {
  it('renders template from pack blocks', () => {
    const root = createRoot()

    writeFileSync(join(root, 'blocks/core.md'), '## Core\n')
    writeFileSync(
      join(root, 'templates/AGENTS.md.hbs'),
      '{{block "core"}}\npackage={{packageManager}}\n',
    )

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      blocks: {
        core: 'blocks/core.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'template',
          template: 'templates/AGENTS.md.hbs',
        },
      ],
    }

    const rendered = renderTemplate({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
      variables: {
        packageManager: 'pnpm',
      },
    })

    expect(rendered.blockIds).toEqual(['core'])
    expect(rendered.content).toContain('## Core')
    expect(rendered.content).toContain('package=pnpm')
  })

  it('throws when template references missing block', () => {
    const root = createRoot()

    writeFileSync(join(root, 'templates/AGENTS.md.hbs'), '{{block "missing"}}')

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      blocks: {},
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'template',
          template: 'templates/AGENTS.md.hbs',
        },
      ],
    }

    expect(() =>
      renderTemplate({
        pack,
        packRoot: root,
        install: pack.installs[0]!,
      }),
    ).toThrow(/missing block "missing"/)
  })
})
```

---

## `packages/core/src/install-renderer.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AirulesPack } from '@baicie/airules-schema'
import { renderInstall } from './install-renderer'

let currentTmpDir: string | null = null

function createRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-render-'))
  mkdirSync(join(currentTmpDir, 'modules'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'blocks'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'templates'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'files/.cursor/rules'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'skills/shadcn-page'), { recursive: true })
  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, { recursive: true, force: true })
    currentTmpDir = null
  }
})

describe('renderInstall', () => {
  it('renders modules install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'modules/core.md'), '## Core\n')

    const pack: AirulesPack = {
      name: '@baicie/test',
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
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
    })

    expect(rendered.files).toHaveLength(1)
    expect(rendered.modules).toEqual(['core'])
    expect(rendered.files[0]?.content).toBe('## Core\n')
  })

  it('renders template install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'blocks/core.md'), '## Core\n')
    writeFileSync(join(root, 'templates/AGENTS.md.hbs'), '{{block "core"}}')

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      blocks: {
        core: 'blocks/core.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'template',
          template: 'templates/AGENTS.md.hbs',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
    })

    expect(rendered.blocks).toEqual(['core'])
    expect(rendered.files[0]?.content).toContain('## Core')
  })

  it('renders file install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'files/.cursor/rules/shadcn.mdc'), '---\n---\n')

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/shadcn.mdc',
          mode: 'file',
          from: 'files/.cursor/rules/shadcn.mdc',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
    })

    expect(rendered.files[0]?.target).toBe('.cursor/rules/shadcn.mdc')
    expect(rendered.files[0]?.content).toBe('---\n---\n')
  })

  it('renders directory install', () => {
    const root = createRoot()
    writeFileSync(
      join(root, 'skills/shadcn-page/SKILL.md'),
      '---\nname: test\n---\n',
    )

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'skill',
          agent: 'skill',
          target: '.agents/skills/shadcn-page',
          mode: 'directory',
          from: 'skills/shadcn-page',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
    })

    expect(rendered.files).toHaveLength(1)
    expect(rendered.files[0]?.target).toBe(
      '.agents/skills/shadcn-page/SKILL.md',
    )
    expect(rendered.files[0]?.content).toContain('name: test')
  })
})
```

---

## `packages/core/src/path-utils.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { assertInsideDirectory, safeResolveInside } from './path-utils'

describe('path-utils', () => {
  it('resolves safe child path', () => {
    const result = safeResolveInside('/repo', 'docs/ai/rules.md')
    expect(result).toMatch(/[\\/]repo[\\/]docs[\\/]ai[\\/]rules\.md$/)
  })

  it('rejects parent traversal', () => {
    expect(() => safeResolveInside('/repo', '../evil.md')).toThrow(
      /outside root/,
    )
  })

  it('rejects exact root as file target', () => {
    expect(() => assertInsideDirectory('/repo', '/repo')).toThrow(
      /outside root/,
    )
  })
})
```

---

## `packages/core/src/installer-phase3.test.ts`

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
import { installLocalPack } from './installer'
import { readAirulesLockfile } from './lockfile'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-phase3-'))

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/blocks'), {
    recursive: true,
  })
  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/templates'), {
    recursive: true,
  })
  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/files/.cursor/rules'), {
    recursive: true,
  })
  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/skills/shadcn-page'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/airules.pack.json'),
    JSON.stringify(
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        profiles: {
          default: {
            installs: ['codex', 'cursor', 'skill'],
            variables: {
              packageManager: 'pnpm',
              requireTests: true,
            },
          },
        },
        blocks: {
          core: 'blocks/core.md',
          shadcn: 'blocks/shadcn.md',
          testing: 'blocks/testing.md',
        },
        installs: [
          {
            id: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'template',
            template: 'templates/AGENTS.md.hbs',
            merge: 'managed-block',
          },
          {
            id: 'cursor',
            agent: 'cursor',
            target: '.cursor/rules/shadcn.mdc',
            mode: 'file',
            from: 'files/.cursor/rules/shadcn.mdc',
            merge: 'overwrite-managed',
          },
          {
            id: 'skill',
            agent: 'skill',
            target: '.agents/skills/shadcn-page',
            mode: 'directory',
            from: 'skills/shadcn-page',
            merge: 'overwrite-managed',
          },
        ],
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/blocks/core.md'),
    '## Core\n',
  )
  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/blocks/shadcn.md'),
    '## shadcn\n',
  )
  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/blocks/testing.md'),
    '## Testing\n',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/templates/AGENTS.md.hbs'),
    [
      '{{block "core"}}',
      '{{block "shadcn"}}',
      'package={{packageManager}}',
      '{{#if requireTests}}{{block "testing"}}{{/if}}',
    ].join('\n'),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/files/.cursor/rules/shadcn.mdc'),
    '---\ndescription: shadcn rules\n---\n\n# Cursor shadcn\n',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/skills/shadcn-page/SKILL.md'),
    '---\nname: shadcn-page\n---\n\n# Skill\n',
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

describe('phase3 installer', () => {
  it('installs template, file, and directory modes', () => {
    const cwd = createProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
    })

    expect(result.operations.map(operation => operation.target)).toEqual([
      'AGENTS.md',
      '.cursor/rules/shadcn.mdc',
      '.agents/skills/shadcn-page/SKILL.md',
    ])

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')
    expect(agents).toContain('## shadcn')
    expect(agents).toContain('package=pnpm')
    expect(agents).toContain('## Testing')
    expect(agents).toContain('<!-- airules:start')

    const cursor = readFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'utf8')
    expect(cursor.startsWith('---')).toBe(true)
    expect(cursor).toContain('# Cursor shadcn')
    expect(cursor).not.toContain('airules:managed')

    const skill = readFileSync(
      join(cwd, '.agents/skills/shadcn-page/SKILL.md'),
      'utf8',
    )
    expect(skill.startsWith('---')).toBe(true)
    expect(skill).toContain('name: shadcn-page')

    const lockfile = readAirulesLockfile(cwd)
    expect(lockfile.installs).toHaveLength(3)
    expect(
      lockfile.installs.find(install => install.installId === 'codex')?.blocks,
    ).toEqual(['core', 'shadcn', 'testing'])
    expect(
      lockfile.installs.find(install => install.installId === 'skill')
        ?.files?.[0]?.target,
    ).toBe('.agents/skills/shadcn-page/SKILL.md')
  })

  it('refuses to overwrite unmanaged file for overwrite-managed', () => {
    const cwd = createProject()

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })

    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'user content')

    expect(() =>
      installLocalPack({
        cwd,
        source: './packs/react-shadcn',
        agents: ['cursor'],
      }),
    ).toThrow(/Refusing to overwrite unmanaged file/)
  })

  it('allows overwrite-managed update after lockfile records file hash', () => {
    const cwd = createProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['cursor'],
    })

    writeFileSync(
      join(cwd, 'packs/react-shadcn/files/.cursor/rules/shadcn.mdc'),
      '---\ndescription: updated\n---\n\n# Updated\n',
    )

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['cursor'],
    })

    expect(result.operations[0]?.action).toBe('update')

    const cursor = readFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'utf8')
    expect(cursor).toContain('# Updated')
  })

  it('supports manual merge by staging generated content', () => {
    const cwd = createProject()
    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const pack = JSON.parse(readFileSync(packPath, 'utf8'))

    pack.installs[1].merge = 'manual'

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['cursor'],
    })

    expect(result.operations[0]?.action).toBe('stage')
    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(false)
    expect(
      existsSync(
        join(
          cwd,
          '.agents/agent/staged/_baicie_react-shadcn/cursor/.cursor/rules/shadcn.mdc',
        ),
      ),
    ).toBe(true)
  })
})
```

---

## `packages/schema/src/schema.test.ts` 追加

```ts
it('parses lock install files', () => {
  const lockfile = {
    lockfileVersion: 1,
    generatedAt: '2026-06-14T00:00:00.000Z',
    airulesVersion: '0.0.0',
    packs: [],
    installs: [
      {
        pack: '@baicie/react-shadcn',
        installId: 'cursor',
        agent: 'cursor',
        target: '.cursor/rules/shadcn.mdc',
        mode: 'file',
        merge: 'overwrite-managed',
        files: [
          {
            target: '.cursor/rules/shadcn.mdc',
            contentHash: 'sha256-file',
          },
        ],
        contentHash: 'sha256-install',
      },
    ],
  }

  expect(() => AirulesLockfileSchema.parse(lockfile)).not.toThrow()
})
```

确保测试文件 import 包含：

```ts
import { AirulesLockfileSchema } from './index'
```

---

# 12. 新增 `docs/phase3.md`

````md
# Phase 3 Design

## Goal

Phase 3 adds template, block, file, and directory install support.

Phase 1 implemented local module installs.
Phase 2 implemented GitHub source and cache.
Phase 3 turns airules into a multi-agent rule generator and distributor.

## Supported install modes

### modules

Concatenate markdown modules.

### template

Render a template with blocks and variables.

Supported syntax:

```md
{{block "core"}}
{{block:shadcn}}
{{packageManager}}
{{#if requireTests}}
{{block "testing"}}
{{/if}}
```
````

### file

Copy one file into a target file.

Default merge:

```txt
overwrite-managed
```

### directory

Copy a directory into a target directory.

This is mainly for installing skills:

```txt
skills/shadcn-page -> .agents/skills/shadcn-page
```

Default merge:

```txt
overwrite-managed
```

## Merge strategies

### managed-block

Used for AGENTS.md / CLAUDE.md.

Wraps content in:

```md
<!-- airules:start ... -->

...

<!-- airules:end ... -->
```

### overwrite-managed

Used for Cursor rules, Copilot files, and Skill directories.

The target file content is not modified with a managed marker. Instead, the lockfile records per-file hashes.

### skip-if-exists

If target exists, do not overwrite.

### manual

Write generated content to:

```txt
.agents/agent/staged/<pack>/<install>/<target>
```

## Lockfile

Phase 3 adds:

```json
{
  "files": [
    {
      "target": ".cursor/rules/shadcn.mdc",
      "contentHash": "sha256-..."
    }
  ]
}
```

This allows airules to know whether a file was previously generated without polluting frontmatter-sensitive files.

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

node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex,cursor,skill --dry-run
node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex,cursor,skill
node packages/cli/dist/bin.js diff
node packages/cli/dist/bin.js update
node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js doctor
```

---

# Phase 3 验收标准

```txt
1. template mode 可以渲染 block、变量、if 条件。
2. profile.variables + config.variables 能合并，config 优先级更高。
3. file mode 能安装 .cursor/rules/*.mdc，且不破坏 YAML frontmatter。
4. directory mode 能安装 .agents/skills/*，且不破坏 SKILL.md frontmatter。
5. overwrite-managed 不允许覆盖用户手写文件。
6. overwrite-managed 允许覆盖 lockfile 记录过的文件。
7. skip-if-exists 能跳过已有文件。
8. manual 能写入 .agents/agent/staged。
9. lockfile 记录每个生成文件的 target + contentHash。
10. modules + GitHub source 不回退。
```

---

# 建议提交信息

```txt
feat: add phase3 template file and skill installation
```

Phase 3 做完后，`airules` 就不只是“AGENTS.md 拼接器”了，而是能同时分发：

```txt
AGENTS.md
CLAUDE.md
.cursor/rules/*.mdc
.github/copilot-instructions.md
.agents/skills/*
docs/ai/*
```

下一阶段建议做 **Phase 4：remove / prune / doctor 深度校验**，把卸载、孤儿文件检测、lock 与目标文件一致性校验补上。
