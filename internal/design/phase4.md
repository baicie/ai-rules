下面给 **Phase 4：remove / prune / doctor 深度校验 / 安全生命周期管理** 的完整方案与代码。

先说明一下依赖关系：**Phase 4 基于我上一轮给你的 Phase 3 代码继续做**。如果当前仓库还没合入 Phase 3，那么当前 `installer.ts` 仍然只支持 `modules + managed-block`，还会拒绝 `template/file/directory`。
不过协议层已经预留了四种 install mode 和四种 merge strategy。

---

# Phase 4 目标

Phase 4 解决安装后的完整生命周期：

```txt id="me0iz7"
1. remove
   - 安全卸载某个 pack
   - 删除 managed-block
   - 删除 lock 管理的 file/directory 目标文件
   - 不覆盖/删除用户修改过的文件

2. prune
   - 清理 lockfile 中已经不存在的目标文件记录
   - 清理没有 install 的 pack 记录
   - 可选清理空目录

3. doctor
   - 深度检查 config / lock / target 文件一致性
   - 检查 managed-block 是否缺失
   - 检查文件是否被用户修改
   - 检查 lock 记录是否悬空
   - 返回结构化诊断结果

4. CLI
   - airules remove <pack>
   - airules prune
   - airules doctor 深度化
```

---

# 1. 修改 `packages/core/src/managed-block.ts`

新增 `removeManagedBlock` 和 `hasManagedBlock`。

```ts id="ioswwj"
import type { Placement } from '@baicie/airules-schema'
import { sha256 } from './hash'

export interface ManagedBlockMeta {
  pack: string
  install: string
  version: string
  hash?: string
}

export interface ManagedBlockRange {
  start: number
  end: number
}

export function createManagedBlock(
  meta: ManagedBlockMeta,
  content: string,
): string {
  const normalizedContent = normalizeTrailingNewline(content)
  const contentHash = meta.hash ?? sha256(normalizedContent)

  return [
    `<!-- airules:start pack="${meta.pack}" install="${meta.install}" version="${meta.version}" hash="${contentHash}" -->`,
    normalizedContent.trimEnd(),
    `<!-- airules:end pack="${meta.pack}" install="${meta.install}" -->`,
  ].join('\n')
}

export function findManagedBlockRange(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
): ManagedBlockRange | null {
  const startPattern = new RegExp(
    `<!--\\s*airules:start\\s+pack="${escapeRegExp(
      meta.pack,
    )}"\\s+install="${escapeRegExp(meta.install)}"[^>]*-->`,
  )

  const endPattern = new RegExp(
    `<!--\\s*airules:end\\s+pack="${escapeRegExp(
      meta.pack,
    )}"\\s+install="${escapeRegExp(meta.install)}"\\s*-->`,
  )

  const startMatch = startPattern.exec(source)

  if (!startMatch || typeof startMatch.index !== 'number') {
    return null
  }

  const rest = source.slice(startMatch.index + startMatch[0].length)
  const endMatch = endPattern.exec(rest)

  if (!endMatch || typeof endMatch.index !== 'number') {
    return null
  }

  const end =
    startMatch.index +
    startMatch[0].length +
    endMatch.index +
    endMatch[0].length

  return {
    start: startMatch.index,
    end,
  }
}

export function hasManagedBlock(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
): boolean {
  return findManagedBlockRange(source, meta) !== null
}

export function replaceManagedBlock(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
  nextBlock: string,
): string | null {
  const range = findManagedBlockRange(source, meta)

  if (!range) {
    return null
  }

  return `${source.slice(0, range.start)}${nextBlock}${source.slice(range.end)}`
}

export function removeManagedBlock(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
): string | null {
  const range = findManagedBlockRange(source, meta)

  if (!range) {
    return null
  }

  const before = source.slice(0, range.start).trimEnd()
  const after = source.slice(range.end).trimStart()

  if (!before && !after) {
    return ''
  }

  if (!before) {
    return normalizeTrailingNewline(after)
  }

  if (!after) {
    return normalizeTrailingNewline(before)
  }

  return `${before}\n\n${after}\n`
}

export function upsertManagedBlock(
  source: string,
  meta: ManagedBlockMeta,
  content: string,
  placement: Placement = { type: 'append' },
): string {
  const nextBlock = createManagedBlock(meta, content)
  const replaced = replaceManagedBlock(source, meta, nextBlock)

  if (replaced !== null) {
    return replaced
  }

  return insertByPlacement(source, nextBlock, placement)
}

export function insertByPlacement(
  source: string,
  insertion: string,
  placement: Placement,
): string {
  switch (placement.type) {
    case 'append': {
      return appendBlock(source, insertion)
    }

    case 'prepend': {
      return prependBlock(source, insertion)
    }

    case 'after-heading': {
      const inserted = insertAroundHeading(source, insertion, {
        heading: placement.heading,
        position: 'after',
      })

      if (inserted !== null) {
        return inserted
      }

      return applyFallback(source, insertion, placement.fallback)
    }

    case 'before-heading': {
      const inserted = insertAroundHeading(source, insertion, {
        heading: placement.heading,
        position: 'before',
      })

      if (inserted !== null) {
        return inserted
      }

      return applyFallback(source, insertion, placement.fallback)
    }

    case 'replace-file': {
      return normalizeTrailingNewline(insertion)
    }

    default: {
      const neverPlacement: never = placement
      throw new Error(
        `Unsupported placement: ${JSON.stringify(neverPlacement)}`,
      )
    }
  }
}

function appendBlock(source: string, insertion: string): string {
  if (!source.trim()) {
    return normalizeTrailingNewline(insertion)
  }

  return `${source.trimEnd()}\n\n${normalizeTrailingNewline(insertion)}`
}

function prependBlock(source: string, insertion: string): string {
  if (!source.trim()) {
    return normalizeTrailingNewline(insertion)
  }

  return `${insertion.trimEnd()}\n\n${source.trimStart()}`
}

function insertAroundHeading(
  source: string,
  insertion: string,
  options: {
    heading: string
    position: 'before' | 'after'
  },
): string | null {
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex(line => line.trim() === options.heading)

  if (index === -1) {
    return null
  }

  if (options.position === 'before') {
    const before = lines.slice(0, index).join('\n').trimEnd()
    const after = lines.slice(index).join('\n').trimStart()

    return [before, insertion.trimEnd(), after]
      .filter(Boolean)
      .join('\n\n')
      .concat('\n')
  }

  const before = lines
    .slice(0, index + 1)
    .join('\n')
    .trimEnd()
  const after = lines
    .slice(index + 1)
    .join('\n')
    .trimStart()

  return [before, insertion.trimEnd(), after]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n')
}

function applyFallback(
  source: string,
  insertion: string,
  fallback: 'append' | 'prepend' | 'error' | undefined,
): string {
  if (!fallback || fallback === 'append') {
    return appendBlock(source, insertion)
  }

  if (fallback === 'prepend') {
    return prependBlock(source, insertion)
  }

  throw new Error('Cannot find placement heading and fallback is error.')
}

function normalizeTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

---

# 2. 修改 `packages/core/src/lockfile.ts`

新增删除和清理能力。

```ts id="o9kbji"
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
```

---

# 3. 新增 `packages/core/src/remove.ts`

```ts id="1mgrw1"
import type { AirulesLockInstall, MergeStrategy } from '@baicie/airules-schema'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { sha256 } from './hash'
import {
  readAirulesLockfile,
  removePackFromLockfile,
  writeAirulesLockfile,
} from './lockfile'
import { removeManagedBlock } from './managed-block'
import { ensureParentDirectory, safeResolveTarget } from './path-utils'

export interface RemovePackOptions {
  cwd: string
  pack: string
  dryRun?: boolean
  force?: boolean
}

export type RemoveAction =
  | 'remove-managed-block'
  | 'delete-file'
  | 'skip-missing'
  | 'skip-modified'
  | 'unchanged'

export interface RemoveOperation {
  pack: string
  installId: string
  target: string
  action: RemoveAction
  reason?: string
}

export interface RemovePackResult {
  pack: string
  operations: RemoveOperation[]
}

export function removePack(options: RemovePackOptions): RemovePackResult {
  const lockfile = readAirulesLockfile(options.cwd)
  const installs = lockfile.installs.filter(
    install => install.pack === options.pack,
  )

  if (installs.length === 0) {
    throw new Error(`Pack "${options.pack}" is not installed.`)
  }

  const operations: RemoveOperation[] = []
  const dryRun = options.dryRun === true
  const force = options.force === true

  for (const install of installs) {
    operations.push(
      ...removeInstall({
        cwd: options.cwd,
        install,
        dryRun,
        force,
      }),
    )
  }

  if (!dryRun) {
    writeAirulesLockfile(
      options.cwd,
      removePackFromLockfile(lockfile, options.pack),
    )
  }

  return {
    pack: options.pack,
    operations,
  }
}

function removeInstall(options: {
  cwd: string
  install: AirulesLockInstall
  dryRun: boolean
  force: boolean
}): RemoveOperation[] {
  const merge =
    options.install.merge ?? defaultMergeForLockInstall(options.install)
  const files = options.install.files?.length
    ? options.install.files
    : [
        {
          target: options.install.target,
          contentHash: options.install.contentHash,
        },
      ]

  const operations: RemoveOperation[] = []

  for (const file of files) {
    if (merge === 'managed-block') {
      operations.push(
        removeManagedBlockTarget({
          cwd: options.cwd,
          install: options.install,
          target: file.target,
          dryRun: options.dryRun,
        }),
      )
      continue
    }

    operations.push(
      removeGeneratedFileTarget({
        cwd: options.cwd,
        install: options.install,
        target: file.target,
        expectedHash: file.contentHash,
        dryRun: options.dryRun,
        force: options.force,
      }),
    )
  }

  return operations
}

function removeManagedBlockTarget(options: {
  cwd: string
  install: AirulesLockInstall
  target: string
  dryRun: boolean
}): RemoveOperation {
  const targetPath = safeResolveTarget(options.cwd, options.target)

  if (!existsSync(targetPath)) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'target file does not exist',
    }
  }

  const previousContent = readFileSync(targetPath, 'utf8')
  const nextContent = removeManagedBlock(previousContent, {
    pack: options.install.pack,
    install: options.install.installId,
  })

  if (nextContent === null) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'managed block does not exist',
    }
  }

  if (!options.dryRun) {
    ensureParentDirectory(targetPath)

    if (nextContent.trim().length === 0) {
      rmSync(targetPath, {
        force: true,
      })
    } else {
      writeFileSync(targetPath, nextContent)
    }

    cleanupEmptyParents(dirname(targetPath), options.cwd)
  }

  return {
    pack: options.install.pack,
    installId: options.install.installId,
    target: options.target,
    action: 'remove-managed-block',
  }
}

function removeGeneratedFileTarget(options: {
  cwd: string
  install: AirulesLockInstall
  target: string
  expectedHash: string
  dryRun: boolean
  force: boolean
}): RemoveOperation {
  const targetPath = safeResolveTarget(options.cwd, options.target)

  if (!existsSync(targetPath)) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-missing',
      reason: 'target file does not exist',
    }
  }

  const currentContent = readFileSync(targetPath, 'utf8')
  const currentHash = sha256(currentContent)

  if (!options.force && currentHash !== options.expectedHash) {
    return {
      pack: options.install.pack,
      installId: options.install.installId,
      target: options.target,
      action: 'skip-modified',
      reason: 'target file was modified by user',
    }
  }

  if (!options.dryRun) {
    rmSync(targetPath, {
      force: true,
    })
    cleanupEmptyParents(dirname(targetPath), options.cwd)
  }

  return {
    pack: options.install.pack,
    installId: options.install.installId,
    target: options.target,
    action: 'delete-file',
  }
}

function defaultMergeForLockInstall(
  install: AirulesLockInstall,
): MergeStrategy {
  if (install.mode === 'modules' || install.mode === 'template') {
    return 'managed-block'
  }

  return 'overwrite-managed'
}

function cleanupEmptyParents(startDir: string, root: string): void {
  let current = startDir

  while (current.startsWith(root) && current !== root) {
    try {
      rmSync(current, {
        recursive: false,
      })
      current = dirname(current)
    } catch {
      return
    }
  }
}
```

---

# 4. 新增 `packages/core/src/doctor.ts`

```ts id="i25pkb"
import type { AirulesLockInstall, MergeStrategy } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { AirulesLockfileSchema } from '@baicie/airules-schema'
import { sha256 } from './hash'
import { readAirulesLockfile } from './lockfile'
import { findManagedBlockRange } from './managed-block'
import { safeResolveTarget } from './path-utils'

export type DoctorSeverity = 'ok' | 'warning' | 'error'

export interface DoctorIssue {
  severity: DoctorSeverity
  code: string
  message: string
  target?: string
  pack?: string
  installId?: string
}

export interface DoctorResult {
  ok: boolean
  issues: DoctorIssue[]
}

export interface RunDoctorOptions {
  cwd: string
}

export function runDoctor(options: RunDoctorOptions): DoctorResult {
  const issues: DoctorIssue[] = []

  let lockfile: ReturnType<typeof readAirulesLockfile>

  try {
    lockfile = readAirulesLockfile(options.cwd)
    AirulesLockfileSchema.parse(lockfile)
    issues.push({
      severity: 'ok',
      code: 'lockfile-valid',
      message: 'Lockfile schema is valid.',
    })
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'lockfile-invalid',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  if (lockfile.installs.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'no-installs',
      message: 'No installed airules entries found in lockfile.',
    })
  }

  for (const install of lockfile.installs) {
    issues.push(...checkInstall(options.cwd, install))
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    issues,
  }
}

function checkInstall(cwd: string, install: AirulesLockInstall): DoctorIssue[] {
  const merge = install.merge ?? defaultMergeForLockInstall(install)
  const files = install.files?.length
    ? install.files
    : [
        {
          target: install.target,
          contentHash: install.contentHash,
        },
      ]

  const issues: DoctorIssue[] = []

  for (const file of files) {
    const targetPath = safeResolveTarget(cwd, file.target)

    if (!existsSync(targetPath)) {
      issues.push({
        severity: 'error',
        code: 'target-missing',
        message: `Target file is missing: ${file.target}`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })
      continue
    }

    const content = readFileSync(targetPath, 'utf8')

    if (merge === 'managed-block') {
      const range = findManagedBlockRange(content, {
        pack: install.pack,
        install: install.installId,
      })

      if (range === null) {
        issues.push({
          severity: 'error',
          code: 'managed-block-missing',
          message: `Managed block is missing in ${file.target}.`,
          target: file.target,
          pack: install.pack,
          installId: install.installId,
        })
        continue
      }

      issues.push({
        severity: 'ok',
        code: 'managed-block-present',
        message: `Managed block exists in ${file.target}.`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })

      continue
    }

    const currentHash = sha256(content)

    if (currentHash !== file.contentHash) {
      issues.push({
        severity: 'warning',
        code: 'target-modified',
        message: `Target file was modified after install: ${file.target}`,
        target: file.target,
        pack: install.pack,
        installId: install.installId,
      })
      continue
    }

    issues.push({
      severity: 'ok',
      code: 'target-clean',
      message: `Target file matches lock hash: ${file.target}`,
      target: file.target,
      pack: install.pack,
      installId: install.installId,
    })
  }

  return issues
}

function defaultMergeForLockInstall(
  install: AirulesLockInstall,
): MergeStrategy {
  if (install.mode === 'modules' || install.mode === 'template') {
    return 'managed-block'
  }

  return 'overwrite-managed'
}
```

---

# 5. 新增 `packages/core/src/prune.ts`

```ts id="3p269d"
import { existsSync } from 'node:fs'
import {
  readAirulesLockfile,
  pruneLockfile,
  writeAirulesLockfile,
} from './lockfile'
import { findManagedBlockRange } from './managed-block'
import { safeResolveTarget, readTextFile } from './path-utils'

export interface PruneOptions {
  cwd: string
  dryRun?: boolean
}

export interface PruneOperation {
  pack: string
  installId: string
  action: 'keep' | 'prune'
  reason: string
}

export interface PruneResult {
  operations: PruneOperation[]
}

export function pruneAirules(options: PruneOptions): PruneResult {
  const lockfile = readAirulesLockfile(options.cwd)
  const operations: PruneOperation[] = []

  const nextLockfile = pruneLockfile(lockfile, install => {
    const keep = shouldKeepInstall(options.cwd, install)
    operations.push({
      pack: install.pack,
      installId: install.installId,
      action: keep.keep ? 'keep' : 'prune',
      reason: keep.reason,
    })
    return keep.keep
  })

  if (options.dryRun !== true) {
    writeAirulesLockfile(options.cwd, nextLockfile)
  }

  return {
    operations,
  }
}

function shouldKeepInstall(
  cwd: string,
  install: {
    pack: string
    installId: string
    target: string
    merge?: string
    mode: string
    files?: Array<{ target: string; contentHash: string }>
  },
): { keep: boolean; reason: string } {
  const merge =
    install.merge ??
    (install.mode === 'modules' || install.mode === 'template'
      ? 'managed-block'
      : 'overwrite-managed')

  const files = install.files?.length
    ? install.files
    : [
        {
          target: install.target,
          contentHash: '',
        },
      ]

  for (const file of files) {
    const targetPath = safeResolveTarget(cwd, file.target)

    if (!existsSync(targetPath)) {
      continue
    }

    if (merge === 'managed-block') {
      const content = readTextFile(targetPath)
      const range = findManagedBlockRange(content, {
        pack: install.pack,
        install: install.installId,
      })

      if (range !== null) {
        return {
          keep: true,
          reason: 'managed block exists',
        }
      }

      continue
    }

    return {
      keep: true,
      reason: 'target file exists',
    }
  }

  return {
    keep: false,
    reason: 'all targets are missing or managed block is missing',
  }
}
```

---

# 6. 修改 `packages/core/src/index.ts`

```ts id="eszgyw"
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
export * from './remove'
export * from './security'
export * from './source'
export * from './template-renderer'
```

---

# 7. 新增 CLI：`packages/cli/src/commands/remove.ts`

```ts id="g4lqlr"
import { removePack } from '@baicie/airules-core'

export interface RemoveCommandOptions {
  cwd: string
  pack: string
  dryRun?: boolean
  force?: boolean
}

export async function runRemoveCommand(
  options: RemoveCommandOptions,
): Promise<void> {
  const result = removePack({
    cwd: options.cwd,
    pack: options.pack,
    dryRun: options.dryRun === true,
    force: options.force === true,
  })

  console.info(options.dryRun ? 'airules remove dry-run' : 'airules remove')

  for (const operation of result.operations) {
    const reason = operation.reason ? ` - ${operation.reason}` : ''
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.installId})${reason}`,
    )
  }
}
```

---

# 8. 新增 CLI：`packages/cli/src/commands/prune.ts`

```ts id="av1353"
import { pruneAirules } from '@baicie/airules-core'

export interface PruneCommandOptions {
  cwd: string
  dryRun?: boolean
}

export async function runPruneCommand(
  options: PruneCommandOptions,
): Promise<void> {
  const result = pruneAirules({
    cwd: options.cwd,
    dryRun: options.dryRun === true,
  })

  console.info(options.dryRun ? 'airules prune dry-run' : 'airules prune')

  for (const operation of result.operations) {
    console.info(
      `- ${operation.action}: ${operation.pack}:${operation.installId} - ${operation.reason}`,
    )
  }
}
```

---

# 9. 替换 CLI：`packages/cli/src/commands/doctor.ts`

```ts id="zwhdb3"
import { existsSync, readFileSync } from 'node:fs'
import {
  getAirulesLockPath,
  loadAirulesConfigSync,
  resolveAirulesConfigPath,
  runDoctor,
} from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export interface DoctorCommandOptions {
  cwd: string
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  const resolvedConfig = resolveAirulesConfigPath(options.cwd)

  console.info('airules doctor')

  if (!resolvedConfig) {
    console.info('✖ Config not found under .agents/agent')
    process.exitCode = 1
    return
  }

  console.info(`✔ Config found: ${resolvedConfig.path}`)

  try {
    loadAirulesConfigSync(options.cwd)
    console.info('✔ Config schema valid')
  } catch (error) {
    console.info('✖ Config schema invalid')
    console.info(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const lockPath = getAirulesLockPath(options.cwd)

  if (!existsSync(lockPath)) {
    console.info('⚠ Lockfile not found')
    return
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    AirulesLockfileSchema.parse(lock)
    console.info(`✔ Lockfile valid: ${lockPath}`)
  } catch (error) {
    console.info('✖ Lockfile invalid')
    console.info(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const result = runDoctor({
    cwd: options.cwd,
  })

  for (const issue of result.issues) {
    const prefix =
      issue.severity === 'ok' ? '✔' : issue.severity === 'warning' ? '⚠' : '✖'

    console.info(`${prefix} ${issue.code}: ${issue.message}`)
  }

  if (!result.ok) {
    process.exitCode = 1
  }
}
```

---

# 10. 修改 CLI：`packages/cli/src/bin.ts`

增加 `remove/prune`。

```ts id="q7zrun"
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
import { runRemoveCommand } from './commands/remove'
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

# 11. 单元测试

## `packages/core/src/remove.test.ts`

```ts id="mvxwbr"
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
import { sha256 } from './hash'
import { createManagedBlock } from './managed-block'
import { removePack } from './remove'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-remove-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })
  return currentTmpDir
}

function writeLock(cwd: string): void {
  writeFileSync(
    join(cwd, '.agents/agent/airules.lock.json'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        generatedAt: '2026-06-14T00:00:00.000Z',
        airulesVersion: '0.0.0',
        packs: [
          {
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            source: './packs/react-shadcn',
            resolved: {
              type: 'local',
              path: '/tmp/pack',
            },
            hash: 'sha256-pack',
          },
        ],
        installs: [
          {
            pack: '@baicie/react-shadcn',
            installId: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            merge: 'managed-block',
            contentHash: 'sha256-rendered',
          },
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
                contentHash: sha256('cursor content\n'),
              },
            ],
            contentHash: sha256('cursor content\n'),
          },
        ],
      },
      null,
      2,
    ),
  )
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

describe('removePack', () => {
  it('removes managed block and generated files', () => {
    const cwd = createProject()
    writeLock(cwd)

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      [
        '# AGENTS',
        '',
        createManagedBlock(
          {
            pack: '@baicie/react-shadcn',
            install: 'codex',
            version: '0.1.0',
          },
          '## Core\n',
        ),
        '',
        '## Commands',
      ].join('\n'),
    )

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })
    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'cursor content\n')

    const result = removePack({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(result.operations.map(operation => operation.action)).toEqual([
      'remove-managed-block',
      'delete-file',
    ])

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).not.toContain(
      'airules:start',
    )
    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(false)

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )
    expect(lock).not.toContain('@baicie/react-shadcn')
  })

  it('does not delete modified generated file without force', () => {
    const cwd = createProject()
    writeLock(cwd)

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })
    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'user modified\n')

    const result = removePack({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(
      result.operations.some(operation => operation.action === 'skip-modified'),
    ).toBe(true)
    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(true)
  })

  it('deletes modified file with force', () => {
    const cwd = createProject()
    writeLock(cwd)

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })
    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'user modified\n')

    const result = removePack({
      cwd,
      pack: '@baicie/react-shadcn',
      force: true,
    })

    expect(
      result.operations.some(operation => operation.action === 'delete-file'),
    ).toBe(true)
    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(false)
  })

  it('supports dry-run without changing files or lockfile', () => {
    const cwd = createProject()
    writeLock(cwd)

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      createManagedBlock(
        {
          pack: '@baicie/react-shadcn',
          install: 'codex',
          version: '0.1.0',
        },
        '## Core\n',
      ),
    )

    removePack({
      cwd,
      pack: '@baicie/react-shadcn',
      dryRun: true,
    })

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain(
      'airules:start',
    )

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )
    expect(lock).toContain('@baicie/react-shadcn')
  })
})
```

---

## `packages/core/src/doctor.test.ts`

```ts id="mpsy07"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256 } from './hash'
import { createManagedBlock } from './managed-block'
import { runDoctor } from './doctor'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-doctor-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })
  return currentTmpDir
}

function writeLock(cwd: string, cursorHash: string): void {
  writeFileSync(
    join(cwd, '.agents/agent/airules.lock.json'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        generatedAt: '2026-06-14T00:00:00.000Z',
        airulesVersion: '0.0.0',
        packs: [],
        installs: [
          {
            pack: '@baicie/react-shadcn',
            installId: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            merge: 'managed-block',
            contentHash: 'sha256-rendered',
          },
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
                contentHash: cursorHash,
              },
            ],
            contentHash: cursorHash,
          },
        ],
      },
      null,
      2,
    ),
  )
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

describe('runDoctor', () => {
  it('reports ok for managed block and clean generated file', () => {
    const cwd = createProject()

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      createManagedBlock(
        {
          pack: '@baicie/react-shadcn',
          install: 'codex',
          version: '0.1.0',
        },
        '## Core\n',
      ),
    )

    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'cursor content\n')
    writeLock(cwd, sha256('cursor content\n'))

    const result = runDoctor({
      cwd,
    })

    expect(result.ok).toBe(true)
    expect(
      result.issues.some(issue => issue.code === 'managed-block-present'),
    ).toBe(true)
    expect(result.issues.some(issue => issue.code === 'target-clean')).toBe(
      true,
    )
  })

  it('reports missing managed block', () => {
    const cwd = createProject()
    writeFileSync(join(cwd, 'AGENTS.md'), '# no block\n')
    writeLock(cwd, sha256('cursor content\n'))

    const result = runDoctor({
      cwd,
    })

    expect(result.ok).toBe(false)
    expect(
      result.issues.some(issue => issue.code === 'managed-block-missing'),
    ).toBe(true)
  })

  it('reports modified generated file as warning', () => {
    const cwd = createProject()

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      createManagedBlock(
        {
          pack: '@baicie/react-shadcn',
          install: 'codex',
          version: '0.1.0',
        },
        '## Core\n',
      ),
    )

    mkdirSync(join(cwd, '.cursor/rules'), {
      recursive: true,
    })
    writeFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'changed\n')
    writeLock(cwd, sha256('cursor content\n'))

    const result = runDoctor({
      cwd,
    })

    expect(result.ok).toBe(true)
    expect(result.issues.some(issue => issue.code === 'target-modified')).toBe(
      true,
    )
  })
})
```

---

## `packages/core/src/prune.test.ts`

```ts id="9imfh8"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createManagedBlock } from './managed-block'
import { pruneAirules } from './prune'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-prune-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })
  return currentTmpDir
}

function writeLock(cwd: string): void {
  writeFileSync(
    join(cwd, '.agents/agent/airules.lock.json'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        generatedAt: '2026-06-14T00:00:00.000Z',
        airulesVersion: '0.0.0',
        packs: [
          {
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            source: './packs/react-shadcn',
            resolved: {
              type: 'local',
              path: '/tmp/pack',
            },
            hash: 'sha256-pack',
          },
        ],
        installs: [
          {
            pack: '@baicie/react-shadcn',
            installId: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            merge: 'managed-block',
            contentHash: 'sha256-rendered',
          },
          {
            pack: '@baicie/react-shadcn',
            installId: 'missing',
            agent: 'cursor',
            target: '.cursor/missing.mdc',
            mode: 'file',
            merge: 'overwrite-managed',
            files: [
              {
                target: '.cursor/missing.mdc',
                contentHash: 'sha256-missing',
              },
            ],
            contentHash: 'sha256-missing',
          },
        ],
      },
      null,
      2,
    ),
  )
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

describe('pruneAirules', () => {
  it('prunes missing install entries and keeps existing managed block', () => {
    const cwd = createProject()
    writeLock(cwd)

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      createManagedBlock(
        {
          pack: '@baicie/react-shadcn',
          install: 'codex',
          version: '0.1.0',
        },
        '## Core\n',
      ),
    )

    const result = pruneAirules({
      cwd,
    })

    expect(result.operations).toEqual([
      {
        pack: '@baicie/react-shadcn',
        installId: 'codex',
        action: 'keep',
        reason: 'managed block exists',
      },
      {
        pack: '@baicie/react-shadcn',
        installId: 'missing',
        action: 'prune',
        reason: 'all targets are missing or managed block is missing',
      },
    ])

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).toContain('"installId": "codex"')
    expect(lock).not.toContain('"installId": "missing"')
  })

  it('supports dry-run without changing lockfile', () => {
    const cwd = createProject()
    writeLock(cwd)

    pruneAirules({
      cwd,
      dryRun: true,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).toContain('"installId": "missing"')
  })
})
```

---

## `packages/core/src/managed-block.test.ts` 追加

```ts id="s3ijhd"
import { removeManagedBlock } from './managed-block'

it('removes managed block without removing user content', () => {
  const source = [
    '# AGENTS',
    '',
    '<!-- airules:start pack="@baicie/react-shadcn" install="codex" version="0.1.0" hash="sha256-x" -->',
    '## Core',
    '<!-- airules:end pack="@baicie/react-shadcn" install="codex" -->',
    '',
    '## Commands',
  ].join('\n')

  const next = removeManagedBlock(source, {
    pack: '@baicie/react-shadcn',
    install: 'codex',
  })

  expect(next).toContain('# AGENTS')
  expect(next).toContain('## Commands')
  expect(next).not.toContain('airules:start')
})
```

---

## `packages/cli/src/commands/remove.test.ts`

```ts id="um34hl"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createManagedBlock } from '@baicie/airules-core'
import { runRemoveCommand } from './remove'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-remove-'))
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

describe('runRemoveCommand', () => {
  it('removes installed pack', async () => {
    const cwd = createProject()

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      createManagedBlock(
        {
          pack: '@baicie/react-shadcn',
          install: 'codex',
          version: '0.1.0',
        },
        '## Core\n',
      ),
    )

    writeFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          generatedAt: '2026-06-14T00:00:00.000Z',
          airulesVersion: '0.0.0',
          packs: [
            {
              name: '@baicie/react-shadcn',
              version: '0.1.0',
              source: './pack',
              resolved: {
                type: 'local',
                path: '/tmp/pack',
              },
              hash: 'sha256-pack',
            },
          ],
          installs: [
            {
              pack: '@baicie/react-shadcn',
              installId: 'codex',
              agent: 'codex',
              target: 'AGENTS.md',
              mode: 'modules',
              merge: 'managed-block',
              contentHash: 'sha256-rendered',
            },
          ],
        },
        null,
        2,
      ),
    )

    await runRemoveCommand({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).not.toContain(
      'airules:start',
    )
  })
})
```

---

## `packages/cli/src/commands/prune.test.ts`

```ts id="2m21vx"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPruneCommand } from './prune'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-prune-'))
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

describe('runPruneCommand', () => {
  it('prunes stale lock entries', async () => {
    const cwd = createProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          generatedAt: '2026-06-14T00:00:00.000Z',
          airulesVersion: '0.0.0',
          packs: [
            {
              name: '@baicie/react-shadcn',
              version: '0.1.0',
              source: './pack',
              resolved: {
                type: 'local',
                path: '/tmp/pack',
              },
              hash: 'sha256-pack',
            },
          ],
          installs: [
            {
              pack: '@baicie/react-shadcn',
              installId: 'missing',
              agent: 'codex',
              target: 'AGENTS.md',
              mode: 'modules',
              merge: 'managed-block',
              contentHash: 'sha256-rendered',
            },
          ],
        },
        null,
        2,
      ),
    )

    await runPruneCommand({
      cwd,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).not.toContain('"installId": "missing"')
  })
})
```

---

# 12. 新增 `docs/phase4.md`

````md id="8yi9gp"
# Phase 4 Design

## Goal

Phase 4 adds lifecycle management for installed airules packs.

It includes:

- remove
- prune
- deep doctor

## Remove

```bash
airules remove @baicie/react-shadcn
airules remove @baicie/react-shadcn --dry-run
airules remove @baicie/react-shadcn --force
```
````

Rules:

- managed-block installs remove only the generated managed block.
- overwrite-managed installs delete files only if their current content hash matches lockfile.
- modified files are skipped unless `--force` is used.
- lockfile entries are removed after successful non-dry-run remove.

## Prune

```bash
airules prune
airules prune --dry-run
```

Rules:

- remove lock installs whose files are missing.
- remove lock installs whose managed block no longer exists.
- remove pack records that no longer have install entries.

## Doctor

```bash
airules doctor
```

Checks:

- config exists
- config schema is valid
- lockfile schema is valid
- managed block exists
- generated files exist
- generated files match lock hash
- modified generated files are reported as warning

## Safety

Phase 4 never removes user-modified files unless `--force` is used.

````

---

# 验证命令

```bash id="a16rsm"
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
````

手动验证：

```bash id="vbelkg"
pnpm --filter @baicie/airules build

node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex,cursor,skill
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js remove @baicie/react-shadcn --dry-run
node packages/cli/dist/bin.js remove @baicie/react-shadcn
node packages/cli/dist/bin.js prune
node packages/cli/dist/bin.js doctor
```

---

# Phase 4 验收标准

```txt id="l3vwwx"
1. remove 能删除 AGENTS.md 中的 managed-block。
2. remove 能删除 lock 记录的 generated file。
3. remove 不删除用户修改过的 generated file。
4. remove --force 能删除用户修改过的 generated file。
5. remove --dry-run 不修改文件和 lockfile。
6. remove 后 lockfile 中对应 pack 和 installs 被删除。
7. prune 能移除缺失目标文件对应的 lock installs。
8. prune 能移除没有 install 的 pack 记录。
9. doctor 能发现 managed-block 缺失。
10. doctor 能发现 generated file 被修改。
11. doctor 能发现 target missing。
12. CLI remove/prune/doctor 都可 await，测试稳定。
```

---

# 建议提交信息

```txt id="27fbxf"
feat: add phase4 remove prune and deep doctor
```

Phase 4 做完后，`airules` 就具备完整的基础生命周期了：

```txt id="03ba7d"
init
add
update
diff
doctor
remove
prune
list
```

下一阶段建议做 **Phase 5：registry / search / named pack alias**，让你可以从：

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

升级成：

```bash
airules add @baicie/react-shadcn
```
