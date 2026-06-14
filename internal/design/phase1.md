下面给 Phase 1 的完整设计与代码。当前仓库 Phase 0 已经有 `AirulesInstall` 的四种模式字段，但 Phase 1 只落地 **local source + modules mode + managed-block merge**。这样不会过早把 template/file/directory 复杂度拉进来；schema 已经预留了这些模式和字段，后续 Phase 2/3 可继续补齐。

当前 `managed-block` 基础函数已经存在，包括创建、查找、替换、upsert 和 placement 插入能力，所以 Phase 1 的核心是补“安装引擎”和 CLI 命令，而不是重写这部分。

---

# Phase 1 目标

## 实现范围

```txt
1. 支持本地规则包安装：airules add ./packs/react-shadcn
2. 支持读取 airules.pack.json
3. 支持 profile + agent 过滤 installs
4. 支持 modules 模式：按 concat 顺序拼接 markdown modules
5. 支持 managed-block 写入目标文件
6. 支持 append / prepend / after-heading / before-heading / replace-file placement
7. 支持 dry-run 预览
8. 支持更新 .agents/agent/airules.lock.json
9. 支持把 add 的 pack 写回 .agents/agent/airules.config.*
10. 新增 update / diff 命令
11. 补完整单元测试
```

## 暂不实现

```txt
1. github source
2. npm source
3. template mode
4. file mode
5. directory mode
6. remove
7. registry search
8. 复杂 AST 保留用户 config 注释
```

---

# 需要修改的文件

```txt
packages/core/src/
├── config-writer.ts          # 新增
├── installer.ts              # 新增
├── lockfile.ts               # 新增
├── module-renderer.ts        # 新增
├── pack-loader.ts            # 新增
├── source.ts                 # 新增
├── index.ts                  # 修改导出
├── profile.ts                # 顺手修复重复递归问题
├── *.test.ts                 # 新增测试

packages/cli/src/
├── bin.ts                    # 新增 add/update/diff 命令
└── commands/
    ├── add.ts                # 新增
    ├── update.ts             # 新增
    └── diff.ts               # 新增

docs/
└── phase1.md                 # 新增
```

当前 CLI 只有 `init / doctor / list` 三个命令，所以 Phase 1 需要明确加 `add / update / diff`。

---

# 1. `packages/core/src/source.ts`

```ts
import { fileURLToPath } from 'node:url'
import { isAbsolute, resolve } from 'node:path'
import type { AirulesResolvedSource } from '@baicie/airules-schema'

export interface ResolvedLocalPackSource {
  source: string
  root: string
  resolved: AirulesResolvedSource
}

export function resolveLocalPackSource(
  source: string,
  cwd = process.cwd(),
): ResolvedLocalPackSource {
  if (source.startsWith('github:')) {
    throw new Error('github source is not supported in Phase 1.')
  }

  if (source.startsWith('npm:')) {
    throw new Error('npm source is not supported in Phase 1.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported in Phase 1.')
  }

  const normalizedSource = source.startsWith('local:')
    ? source.slice('local:'.length)
    : source

  const localPath = normalizedSource.startsWith('file:')
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

# 2. `packages/core/src/pack-loader.ts`

```ts
import type { AirulesPack } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { AirulesPackSchema } from '@baicie/airules-schema'
import type { ResolvedLocalPackSource } from './source'

export interface LoadedAirulesPack {
  root: string
  packFilePath: string
  pack: AirulesPack
  rawContent: string
}

export function loadLocalPack(
  source: ResolvedLocalPackSource,
): LoadedAirulesPack {
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

# 3. `packages/core/src/module-renderer.ts`

```ts
import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RenderModulesOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
}

export interface RenderedModules {
  moduleIds: string[]
  content: string
}

export function renderModules(options: RenderModulesOptions): RenderedModules {
  if (options.install.mode !== 'modules') {
    throw new Error(
      `Install "${options.install.id}" uses mode "${options.install.mode}", but Phase 1 only supports modules mode.`,
    )
  }

  const moduleIds = options.install.concat ?? []

  if (moduleIds.length === 0) {
    throw new Error(
      `Install "${options.install.id}" requires non-empty concat.`,
    )
  }

  const modules = options.pack.modules

  if (!modules) {
    throw new Error(`Pack "${options.pack.name}" does not define modules.`)
  }

  const parts: string[] = []

  for (const moduleId of moduleIds) {
    const modulePath = modules[moduleId]

    if (!modulePath) {
      throw new Error(
        `Install "${options.install.id}" references missing module "${moduleId}".`,
      )
    }

    const absoluteModulePath = join(options.packRoot, modulePath)

    if (!existsSync(absoluteModulePath)) {
      throw new Error(
        `Module "${moduleId}" not found at ${absoluteModulePath}.`,
      )
    }

    const content = readFileSync(absoluteModulePath, 'utf8').trim()

    if (content.length > 0) {
      parts.push(content)
    }
  }

  return {
    moduleIds,
    content: `${parts.join('\n\n')}\n`,
  }
}
```

---

# 4. `packages/core/src/lockfile.ts`

```ts
import type {
  AirulesLockInstall,
  AirulesLockPack,
  AirulesLockfile,
} from '@baicie/airules-schema'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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
  const nextPacks = lockfile.packs.filter(pack => pack.name !== packEntry.name)
  nextPacks.push(packEntry)

  const selectedInstallIds = new Set(
    installEntries.map(install => `${install.pack}:${install.installId}`),
  )

  const nextInstalls = lockfile.installs.filter(install => {
    const key = `${install.pack}:${install.installId}`
    return !selectedInstallIds.has(key)
  })

  nextInstalls.push(...installEntries)

  return {
    ...lockfile,
    generatedAt: new Date().toISOString(),
    packs: nextPacks,
    installs: nextInstalls,
  }
}
```

---

# 5. `packages/core/src/config-writer.ts`

```ts
import type { AirulesConfig, AirulesConfigPack } from '@baicie/airules-schema'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAirulesAgentDir, resolveAirulesConfigPath } from './config-loader'

export function upsertConfigPack(
  config: AirulesConfig,
  packEntry: AirulesConfigPack,
): AirulesConfig {
  const index = config.packs.findIndex(pack => {
    if (packEntry.name && pack.name === packEntry.name) {
      return true
    }

    return pack.source === packEntry.source
  })

  const nextPacks = [...config.packs]

  if (index === -1) {
    nextPacks.push(packEntry)
  } else {
    const previous = nextPacks[index]

    nextPacks[index] = {
      ...previous,
      ...packEntry,
      variables: {
        ...(previous?.variables ?? {}),
        ...(packEntry.variables ?? {}),
      },
    }
  }

  return {
    ...config,
    packs: nextPacks,
  }
}

export function writeAirulesConfig(cwd: string, config: AirulesConfig): void {
  const resolved = resolveAirulesConfigPath(cwd)
  const configPath =
    resolved?.path ?? join(getAirulesAgentDir(cwd), 'airules.config.ts')

  mkdirSync(dirname(configPath), {
    recursive: true,
  })

  if (configPath.endsWith('.json')) {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    return
  }

  writeFileSync(configPath, renderTypeScriptConfig(config))
}

function renderTypeScriptConfig(config: AirulesConfig): string {
  return `import { defineAirulesConfig } from '@baicie/airules-schema'

export default defineAirulesConfig(${JSON.stringify(config, null, 2)})
`
}
```

---

# 6. `packages/core/src/installer.ts`

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
import { createManagedBlock, upsertManagedBlock } from './managed-block'
import { sha256 } from './hash'
import {
  readAirulesLockfile,
  upsertLockEntries,
  writeAirulesLockfile,
} from './lockfile'
import { loadLocalPack } from './pack-loader'
import { selectInstalls } from './profile'
import { renderModules } from './module-renderer'
import { resolveLocalPackSource } from './source'

export interface InstallLocalPackOptions {
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
  contentHash: string
}

export interface InstallLocalPackResult {
  packName: string
  packVersion: string
  source: string
  operations: InstallOperation[]
}

export async function installLocalPack(
  options: InstallLocalPackOptions,
): Promise<InstallLocalPackResult> {
  const resolvedSource = resolveLocalPackSource(options.source, options.cwd)
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

  for (const install of installs) {
    assertPhase1SupportedInstall(install)

    const rendered = renderModules({
      pack: loaded.pack,
      packRoot: loaded.root,
      install,
    })

    const contentHash = sha256(rendered.content)
    const targetPath = resolve(options.cwd, install.target)
    const previousContent = existsSync(targetPath)
      ? readFileSync(targetPath, 'utf8')
      : ''

    const placement = install.placement ?? { type: 'append' as const }

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
      contentHash,
    })

    lockInstallEntries.push({
      pack: loaded.pack.name,
      installId: install.id,
      agent: install.agent,
      target: install.target,
      mode: install.mode,
      merge: install.merge ?? 'managed-block',
      modules: rendered.moduleIds,
      contentHash,
      managedBlockId: `airules:${loaded.pack.name}:${install.id}`,
    })

    if (!options.dryRun && action !== 'unchanged') {
      mkdirSync(dirname(targetPath), {
        recursive: true,
      })
      writeFileSync(targetPath, nextContent)
    }
  }

  if (!options.dryRun) {
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

    if (options.agents?.length) {
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

function assertPhase1SupportedInstall(install: AirulesInstall): void {
  if (install.mode !== 'modules') {
    throw new Error(
      `Install "${install.id}" uses mode "${install.mode}". Phase 1 only supports modules mode.`,
    )
  }

  const merge: MergeStrategy = install.merge ?? 'managed-block'

  if (merge !== 'managed-block') {
    throw new Error(
      `Install "${install.id}" uses merge "${merge}". Phase 1 only supports managed-block merge.`,
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
  const block = createManagedBlock(
    {
      pack: operation.pack,
      install: operation.installId,
      version: 'dry-run',
      hash: operation.contentHash,
    },
    operation.nextContent,
  )

  return block
}
```

> 注意：`createDryRunBlockForOperation` 目前只是可选辅助函数，如果你觉得多余可以删。核心安装流程不依赖它。

---

# 7. 修改 `packages/core/src/profile.ts`

当前实现会重复递归父 profile：一次取 installs，一次取 variables。
建议直接替换成下面版本。

```ts
import type {
  AgentName,
  AirulesInstall,
  AirulesPack,
  AirulesProfile,
} from '@baicie/airules-schema'

export interface ResolvedProfile {
  name: string
  installs?: string[]
  variables: Record<string, unknown>
}

export function resolveProfile(
  pack: AirulesPack,
  profileName = 'default',
): ResolvedProfile {
  const profiles = pack.profiles

  if (!profiles || Object.keys(profiles).length === 0) {
    return {
      name: profileName,
      installs: pack.installs.map((install: AirulesInstall) => install.id),
      variables: {},
    }
  }

  if (!profiles[profileName]) {
    throw new Error(`Profile "${profileName}" does not exist in ${pack.name}.`)
  }

  return resolveProfileInner(profiles, profileName, new Set<string>())
}

function resolveProfileInner(
  profiles: Record<string, AirulesProfile>,
  profileName: string,
  visited: Set<string>,
): ResolvedProfile {
  if (visited.has(profileName)) {
    throw new Error(`Circular profile extends detected: ${profileName}`)
  }

  const profile = profiles[profileName]

  if (!profile) {
    throw new Error(`Profile "${profileName}" does not exist.`)
  }

  visited.add(profileName)

  const base = profile.extends
    ? resolveProfileInner(profiles, profile.extends, visited)
    : {
        name: profileName,
        variables: {},
      }

  visited.delete(profileName)

  const mergedInstalls = mergeStringList(base.installs, profile.installs)

  const result: ResolvedProfile = {
    name: profileName,
    variables: {
      ...base.variables,
      ...(profile.variables ?? {}),
    },
  }

  if (mergedInstalls !== undefined) {
    result.installs = mergedInstalls
  }

  return result
}

function mergeStringList(
  base?: string[],
  current?: string[],
): string[] | undefined {
  if (!base && !current) {
    return undefined
  }

  const result = new Set<string>()

  for (const item of base ?? []) {
    result.add(item)
  }

  for (const item of current ?? []) {
    result.add(item)
  }

  return Array.from(result)
}

export function selectInstalls(
  pack: AirulesPack,
  options?: {
    profile?: string
    agents?: AgentName[]
  },
): AirulesInstall[] {
  const profileName = options?.profile ?? 'default'
  const resolvedProfile = resolveProfile(pack, profileName)

  const fallbackIds = pack.installs.map((install: AirulesInstall) => install.id)
  const selectedIds = resolvedProfile.installs ?? fallbackIds
  const installIdSet = new Set<string>(selectedIds)

  const missingInstallIds: string[] = []

  for (const installId of installIdSet) {
    const exists = pack.installs.some(
      (install: AirulesInstall) => install.id === installId,
    )

    if (!exists) {
      missingInstallIds.push(installId)
    }
  }

  if (missingInstallIds.length > 0) {
    throw new Error(
      `Profile references missing install ids: ${missingInstallIds.join(', ')}`,
    )
  }

  const agentSet = options?.agents ? new Set(options.agents) : null

  return pack.installs.filter((install: AirulesInstall) => {
    if (!installIdSet.has(install.id)) {
      return false
    }

    if (agentSet && !agentSet.has(install.agent)) {
      return false
    }

    return true
  })
}
```

---

# 8. 修改 `packages/core/src/index.ts`

```ts
export * from './config-loader'
export * from './config-writer'
export * from './constants'
export * from './hash'
export * from './installer'
export * from './lockfile'
export * from './managed-block'
export * from './module-renderer'
export * from './pack-loader'
export * from './profile'
export * from './source'
```

---

# 9. `packages/cli/src/commands/add.ts`

```ts
import type { AgentName, AirulesConfig } from '@baicie/airules-schema'
import {
  installLocalPack,
  loadAirulesConfig,
  upsertConfigPack,
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

  const result = await installLocalPack({
    cwd: options.cwd,
    source: options.source,
    profile: options.profile,
    agents,
    dryRun: options.dryRun,
  })

  printInstallSummary(result.operations, Boolean(options.dryRun))

  if (!options.dryRun && options.save !== false) {
    const config = await loadConfigOrCreateEmpty(options.cwd)
    const nextConfig = upsertConfigPack(config, {
      name: result.packName,
      source: options.source,
      profile: options.profile,
      agents,
    })

    writeAirulesConfig(options.cwd, nextConfig)

    console.log(`Saved pack config for ${result.packName}.`)
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

async function loadConfigOrCreateEmpty(cwd: string): Promise<AirulesConfig> {
  try {
    return await loadAirulesConfig(cwd)
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
  console.log(dryRun ? 'airules add dry-run' : 'airules add')

  for (const operation of operations) {
    console.log(
      `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
    )
  }
}
```

---

# 10. `packages/cli/src/commands/update.ts`

```ts
import type { AirulesConfigPack } from '@baicie/airules-schema'
import { installLocalPack, loadAirulesConfig } from '@baicie/airules-core'

export interface UpdateCommandOptions {
  cwd: string
  name?: string
  dryRun?: boolean
}

export async function runUpdateCommand(
  options: UpdateCommandOptions,
): Promise<void> {
  const config = await loadAirulesConfig(options.cwd)
  const packs = filterPacks(config.packs, options.name)

  if (packs.length === 0) {
    throw new Error(
      options.name
        ? `Cannot find configured pack "${options.name}".`
        : 'No configured packs found.',
    )
  }

  console.log(options.dryRun ? 'airules update dry-run' : 'airules update')

  for (const pack of packs) {
    const result = await installLocalPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
      dryRun: options.dryRun,
    })

    console.log(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.log(
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

# 11. `packages/cli/src/commands/diff.ts`

```ts
import { loadAirulesConfig, installLocalPack } from '@baicie/airules-core'

export interface DiffCommandOptions {
  cwd: string
  name?: string
}

export async function runDiffCommand(
  options: DiffCommandOptions,
): Promise<void> {
  const config = await loadAirulesConfig(options.cwd)
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

  console.log('airules diff')

  for (const pack of packs) {
    const result = await installLocalPack({
      cwd: options.cwd,
      source: pack.source,
      profile: pack.profile,
      agents: pack.agents,
      dryRun: true,
    })

    console.log(`\n${result.packName}@${result.packVersion}`)

    for (const operation of result.operations) {
      console.log(`\n--- ${operation.target}`)
      console.log(`action: ${operation.action}`)
      console.log(`install: ${operation.agent}:${operation.installId}`)

      if (operation.action === 'unchanged') {
        continue
      }

      console.log('\nnext content:\n')
      console.log(operation.nextContent)
    }
  }
}
```

---

# 12. 修改 `packages/cli/src/bin.ts`

当前 `bin.ts` 底部直接 `runCli()`，这会导致库入口导入副作用；这里一并修掉。

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
    .command('add <source>', 'Install a local airules pack')
    .option('--profile <profile>', 'Profile name')
    .option('--agent <agents>', 'Comma-separated agent names')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--no-save', 'Do not save the pack into airules config')
    .action(
      async (
        source: string,
        options: {
          profile?: string
          agent?: string
          dryRun?: boolean
          save?: boolean
        },
      ) => {
        await runAddCommand({
          cwd: process.cwd(),
          source,
          profile: options.profile,
          agent: options.agent,
          dryRun: Boolean(options.dryRun),
          save: options.save,
        })
      },
    )

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

# 13. 修改 `packages/cli/tsup.config.ts`

如果当前还在用全局 banner 注入 shebang，建议改成下面。否则 `index.js` 也会被加 shebang，库入口不干净。

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@baicie/airules-core', '@baicie/airules-schema'],
})
```

---

# 14. 单元测试

## `packages/core/src/source.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { resolveLocalPackSource } from './source'

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

  it('rejects github source in Phase 1', () => {
    expect(() =>
      resolveLocalPackSource('github:baicie/ai-rules/packs/react-shadcn'),
    ).toThrow(/github source is not supported in Phase 1/)
  })

  it('rejects npm source in Phase 1', () => {
    expect(() => resolveLocalPackSource('npm:@baicie/react-shadcn')).toThrow(
      /npm source is not supported in Phase 1/,
    )
  })
})
```

---

## `packages/core/src/pack-loader.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLocalPack } from './pack-loader'
import { resolveLocalPackSource } from './source'

let currentTmpDir: string | null = null

function createTempDir(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-pack-'))
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

describe('loadLocalPack', () => {
  it('loads and validates airules.pack.json', () => {
    const root = createTempDir()

    writeFileSync(
      join(root, 'airules.pack.json'),
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
    )

    const source = resolveLocalPackSource(root)
    const loaded = loadLocalPack(source)

    expect(loaded.pack.name).toBe('@baicie/react-shadcn')
    expect(loaded.root).toBe(root)
    expect(loaded.rawContent).toContain('@baicie/react-shadcn')
  })

  it('throws when pack file is missing', () => {
    const root = createTempDir()
    const source = resolveLocalPackSource(root)

    expect(() => loadLocalPack(source)).toThrow(/Cannot find airules.pack.json/)
  })
})
```

---

## `packages/core/src/module-renderer.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AirulesPack } from '@baicie/airules-schema'
import { renderModules } from './module-renderer'

let currentTmpDir: string | null = null

function createTempPackRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-modules-'))
  mkdirSync(join(currentTmpDir, 'modules'), {
    recursive: true,
  })
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

describe('renderModules', () => {
  it('renders modules by concat order', () => {
    const root = createTempPackRoot()

    writeFileSync(join(root, 'modules/core.md'), '## Core\n')
    writeFileSync(join(root, 'modules/shadcn.md'), '## shadcn\n')

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {
        core: 'modules/core.md',
        shadcn: 'modules/shadcn.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core', 'shadcn'],
        },
      ],
    }

    const result = renderModules({
      pack,
      packRoot: root,
      install: pack.installs[0]!,
    })

    expect(result.moduleIds).toEqual(['core', 'shadcn'])
    expect(result.content).toBe('## Core\n\n## shadcn\n')
  })

  it('throws when module id is missing', () => {
    const root = createTempPackRoot()

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {},
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['missing'],
        },
      ],
    }

    expect(() =>
      renderModules({
        pack,
        packRoot: root,
        install: pack.installs[0]!,
      }),
    ).toThrow(/references missing module "missing"/)
  })

  it('throws for non-modules mode in Phase 1', () => {
    const root = createTempPackRoot()

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/rule.mdc',
          mode: 'file',
          from: 'files/rule.mdc',
        },
      ],
    }

    expect(() =>
      renderModules({
        pack,
        packRoot: root,
        install: pack.installs[0]!,
      }),
    ).toThrow(/Phase 1 only supports modules mode/)
  })
})
```

---

## `packages/core/src/lockfile.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { createEmptyLockfile, upsertLockEntries } from './lockfile'

describe('lockfile', () => {
  it('creates empty lockfile', () => {
    const lockfile = createEmptyLockfile('0.0.0')

    expect(lockfile.lockfileVersion).toBe(1)
    expect(lockfile.airulesVersion).toBe('0.0.0')
    expect(lockfile.packs).toEqual([])
    expect(lockfile.installs).toEqual([])
  })

  it('upserts pack and install entries', () => {
    const lockfile = createEmptyLockfile()

    const next = upsertLockEntries(
      lockfile,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          merge: 'managed-block',
          modules: ['core'],
          contentHash: 'sha256-content',
        },
      ],
    )

    expect(next.packs).toHaveLength(1)
    expect(next.installs).toHaveLength(1)
    expect(next.installs[0]?.installId).toBe('codex')
  })

  it('replaces same pack install entry', () => {
    const lockfile = createEmptyLockfile()

    const first = upsertLockEntries(
      lockfile,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          contentHash: 'sha256-old',
        },
      ],
    )

    const second = upsertLockEntries(
      first,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          contentHash: 'sha256-new',
        },
      ],
    )

    expect(second.installs).toHaveLength(1)
    expect(second.installs[0]?.contentHash).toBe('sha256-new')
  })
})
```

---

## `packages/core/src/config-writer.test.ts`

```ts
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAirulesConfig } from './config-loader'
import { upsertConfigPack, writeAirulesConfig } from './config-writer'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-config-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })
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

describe('config-writer', () => {
  it('upserts config pack by source', () => {
    const config = upsertConfigPack(
      {
        version: 1,
        packs: [
          {
            source: './packs/a',
            agents: ['codex'],
          },
        ],
      },
      {
        name: '@baicie/a',
        source: './packs/a',
        profile: 'strict',
        agents: ['codex', 'cursor'],
      },
    )

    expect(config.packs).toHaveLength(1)
    expect(config.packs[0]?.name).toBe('@baicie/a')
    expect(config.packs[0]?.profile).toBe('strict')
    expect(config.packs[0]?.agents).toEqual(['codex', 'cursor'])
  })

  it('writes json config when current config is json', async () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [],
      }),
    )

    writeAirulesConfig(cwd, {
      version: 1,
      packs: [
        {
          source: './packs/react-shadcn',
        },
      ],
    })

    const raw = readFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      'utf8',
    )

    expect(raw).toContain('./packs/react-shadcn')

    const loaded = await loadAirulesConfig(cwd)
    expect(loaded.packs[0]?.source).toBe('./packs/react-shadcn')
  })

  it('writes ts config by default', async () => {
    const cwd = createTempProject()

    writeAirulesConfig(cwd, {
      version: 1,
      packs: [
        {
          source: './packs/react-shadcn',
        },
      ],
    })

    const raw = readFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      'utf8',
    )

    expect(raw).toContain('defineAirulesConfig')
    expect(raw).toContain('./packs/react-shadcn')

    const loaded = await loadAirulesConfig(cwd)
    expect(loaded.packs[0]?.source).toBe('./packs/react-shadcn')
  })
})
```

---

## `packages/core/src/installer.test.ts`

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
import { readAirulesLockfile } from './lockfile'
import { installLocalPack } from './installer'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-install-'))

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/modules'), {
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
            installs: ['codex'],
          },
          strict: {
            extends: 'default',
            installs: ['copilot'],
          },
        },
        modules: {
          core: 'modules/core.md',
          shadcn: 'modules/shadcn.md',
          testing: 'modules/testing.md',
        },
        installs: [
          {
            id: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            placement: {
              type: 'after-heading',
              heading: '## AI Rules',
              fallback: 'append',
            },
            concat: ['core', 'shadcn'],
            merge: 'managed-block',
          },
          {
            id: 'copilot',
            agent: 'copilot',
            target: '.github/copilot-instructions.md',
            mode: 'modules',
            concat: ['core', 'testing'],
            merge: 'managed-block',
          },
        ],
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/core.md'),
    '## Core\n\n- Use TypeScript.',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/shadcn.md'),
    '## shadcn\n\n- Use shadcn/ui.',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/testing.md'),
    '## Testing\n\n- Run tests.',
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

describe('installLocalPack', () => {
  it('installs modules into AGENTS.md with managed block', async () => {
    const cwd = createTempProject()

    writeFileSync(join(cwd, 'AGENTS.md'), '# AGENTS.md\n\n## AI Rules\n')

    const result = await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]?.action).toBe('update')

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')

    expect(agents).toContain('<!-- airules:start')
    expect(agents).toContain('pack="@baicie/react-shadcn"')
    expect(agents).toContain('install="codex"')
    expect(agents).toContain('## Core')
    expect(agents).toContain('## shadcn')

    const lockfile = readAirulesLockfile(cwd)

    expect(lockfile.packs[0]?.name).toBe('@baicie/react-shadcn')
    expect(lockfile.installs[0]?.installId).toBe('codex')
    expect(lockfile.installs[0]?.modules).toEqual(['core', 'shadcn'])
  })

  it('creates target file when missing', async () => {
    const cwd = createTempProject()

    await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true)

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')
  })

  it('supports dry-run without writing files or lockfile', async () => {
    const cwd = createTempProject()

    const result = await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    expect(result.operations[0]?.action).toBe('create')
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(false)
  })

  it('selects installs by profile and agent', async () => {
    const cwd = createTempProject()

    await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      profile: 'strict',
      agents: ['copilot'],
    })

    const copilot = readFileSync(
      join(cwd, '.github/copilot-instructions.md'),
      'utf8',
    )

    expect(copilot).toContain('install="copilot"')
    expect(copilot).toContain('## Testing')

    const lockfile = readAirulesLockfile(cwd)
    expect(lockfile.installs.map(install => install.installId)).toEqual([
      'copilot',
    ])
  })

  it('updates existing managed block instead of duplicating', async () => {
    const cwd = createTempProject()

    await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    writeFileSync(
      join(cwd, 'packs/react-shadcn/modules/shadcn.md'),
      '## shadcn\n\n- Updated rule.',
    )

    await installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')

    expect(agents.match(/airules:start/g)).toHaveLength(1)
    expect(agents).toContain('- Updated rule.')
  })

  it('rejects non-managed-block merge in Phase 1', async () => {
    const cwd = createTempProject()
    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const pack = JSON.parse(readFileSync(packPath, 'utf8'))

    pack.installs[0].merge = 'overwrite-managed'

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    await expect(
      installLocalPack({
        cwd,
        source: './packs/react-shadcn',
        agents: ['codex'],
      }),
    ).rejects.toThrow(/Phase 1 only supports managed-block merge/)
  })
})
```

---

# 15. `docs/phase1.md`

````md
# Phase 1 Design

## Goal

Phase 1 turns the Phase 0 protocol into a usable local installer.

Supported:

- local source
- `airules.pack.json`
- profiles
- agent filtering
- modules mode
- managed-block merge
- lockfile update
- dry-run
- add / update / diff commands

Not supported yet:

- github source
- npm source
- template mode
- file mode
- directory mode
- remove
- registry

## Example

```bash
airules add ./packs/react-shadcn --profile strict --agent codex,cursor
```
````

## Local source

Phase 1 supports:

```txt
./packs/react-shadcn
local:./packs/react-shadcn
file:///absolute/path/to/pack
```

It rejects:

```txt
github:...
npm:...
https://...
```

## Pack structure

```txt
packs/react-shadcn/
├── airules.pack.json
└── modules/
    ├── core.md
    └── shadcn.md
```

## Install mode

Only `modules` mode is supported.

```json
{
  "id": "codex",
  "agent": "codex",
  "target": "AGENTS.md",
  "mode": "modules",
  "concat": ["core", "shadcn"],
  "merge": "managed-block"
}
```

## Merge strategy

Phase 1 only supports `managed-block`.

Generated content is wrapped like this:

```md
<!-- airules:start pack="@baicie/react-shadcn" install="codex" version="0.1.0" hash="sha256-..." -->

...

<!-- airules:end pack="@baicie/react-shadcn" install="codex" -->
```

## Lockfile

The installer writes:

```txt
.agents/agent/airules.lock.json
```

The lockfile records:

- pack name
- pack version
- source
- resolved local path
- selected agents
- selected profile
- installed targets
- installed modules
- generated content hash

````

---

# 验证命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
````

CLI 验证：

```bash
pnpm --filter @baicie/airules build

node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex --dry-run
node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex
node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js diff
node packages/cli/dist/bin.js update
```

---

# Phase 1 验收标准

```txt
1. airules add ./packs/x --agent codex --dry-run 不写文件，只打印操作
2. airules add ./packs/x --agent codex 能写入 AGENTS.md
3. 生成内容被 airules managed block 包裹
4. 再次 add/update 不重复插入 managed block
5. .agents/agent/airules.lock.json 正确记录 pack/install/module/hash
6. add 默认会把 pack 写回 .agents/agent/airules.config.*
7. update 能根据 config 重新安装
8. diff 能预览 config 中所有 pack 的目标文件变化
9. 非 local source 明确报错
10. template/file/directory mode 明确报错，而不是静默失败
```

---

# 建议提交信息

```txt
feat: implement phase1 local module installer
```

这版完成后，`airules` 就从“协议骨架”变成了可用的本地规则安装器。下一阶段可以做 **Phase 2：GitHub source + cache + pinned ref/hash lock**。
