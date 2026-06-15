# 基于 `18baa49` 的剩余工作清单与完整代码

## 当前状态判断

`18baa49` 已经把上一轮 Phase3–Phase6 的关键修复合进去了：

| 能力                               | 当前状态                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `skip-if-exists` 不进 lock         | 已做，`installer.ts` 已通过 `shouldLockOperation` 只记录 `create/update/unchanged`。 |
| managed-block lock hash            | 已修，`managed-block` install 的 `contentHash` 已用 rendered content hash。          |
| remove 跳过用户修改文件时不删 lock | 已修，`removePack` 先预检，遇到 `skip-modified` 会直接返回。                         |
| doctor 检查 managed block 内容漂移 | 已做，`doctor.ts` 已读取 block 内容并比对 hash。                                     |
| CLI 正式命令 + 兼容旧命令          | 已做，`pack validate / pack-build`、`registry list / registry-publish` 都注册了。    |
| template 隐式 block 校验           | 已做，`pack-validator.ts` 已解析 `{{block "x"}}` 和 `{{block:x}}`。                  |

现在距离 MVP/beta 不是差大功能，而是差 **收尾硬化 + e2e + create 脚手架 + dogfood pack**。

---

# 剩余全部内容

## 还剩 4 件事

| 优先级 | 内容                                                    | 目的                              |
| ------ | ------------------------------------------------------- | --------------------------------- |
| P0     | 修 `npm-source`：tarball 解压后校验 `airules.pack.json` | 避免 npm 包下载成功但安装阶段才炸 |
| P0     | 补 e2e：完整 init/add/doctor/diff/remove/prune 流程     | 证明 CLI 主链路能跑               |
| P1     | 补 `airules create pack / skill / registry`             | 后续写真实 pack 不再手搓目录      |
| P1     | 补真实 `packs/react-shadcn` 最小可用包                  | 用于 dogfood `zeus-ui / ai-ops`   |

---

# 1. 修复 npm source 根校验

当前 `resolveNpmPackSource` 下载 tarball 后直接返回 cache root，没有校验解压后根目录是否存在 `airules.pack.json`。

## 替换 `packages/core/src/npm-source.ts`

```ts
import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import * as tar from 'tar'
import { getAirulesAgentDir } from './config-loader'

export interface ParsedNpmSource {
  packageName: string
  version?: string
}

export interface ResolvedNpmPackSource {
  source: string
  root: string
  resolved: Extract<AirulesResolvedSource, { type: 'npm' }>
}

interface NpmPackageMetadata {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmPackageVersion>
}

interface NpmPackageVersion {
  version: string
  dist?: {
    tarball?: string
    integrity?: string
    shasum?: string
  }
}

export function isNpmSource(source: string): boolean {
  return source.startsWith('npm:')
}

export function parseNpmSource(source: string): ParsedNpmSource {
  if (!source.startsWith('npm:')) {
    throw new Error(`Invalid npm source "${source}". Expected npm:...`)
  }

  const body = source.slice('npm:'.length).trim()

  if (body.length === 0) {
    throw new Error('npm source cannot be empty.')
  }

  const atIndex = findVersionAtIndex(body)

  if (atIndex === -1) {
    return {
      packageName: body,
    }
  }

  const packageName = body.slice(0, atIndex)
  const version = body.slice(atIndex + 1)

  if (packageName.length === 0) {
    throw new Error(`Invalid npm source "${source}". Missing package name.`)
  }

  if (version.length === 0) {
    throw new Error(`Invalid npm source "${source}". Missing version.`)
  }

  return {
    packageName,
    version,
  }
}

export async function resolveNpmPackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedNpmPackSource> {
  const parsed = parseNpmSource(source)
  const metadata = await fetchNpmMetadata(parsed.packageName)
  const version = resolveNpmVersion(metadata, parsed.version)
  const packageVersion = metadata.versions?.[version]

  if (!packageVersion) {
    throw new Error(
      `Cannot find npm package "${parsed.packageName}" version "${version}".`,
    )
  }

  const tarball = packageVersion.dist?.tarball

  if (!tarball) {
    throw new Error(
      `Cannot find npm tarball for "${parsed.packageName}@${version}".`,
    )
  }

  const cacheRoot = getNpmPackCacheRoot(cwd, {
    packageName: parsed.packageName,
    version,
  })

  await downloadNpmTarballToCache({
    tarball,
    cacheRoot,
  })

  const packFilePath = join(cacheRoot, 'airules.pack.json')
  if (!existsSync(packFilePath)) {
    throw new Error(
      `npm package "${parsed.packageName}@${version}" does not contain airules.pack.json at package root.`,
    )
  }

  return {
    source,
    root: cacheRoot,
    resolved: {
      type: 'npm',
      packageName: parsed.packageName,
      version,
    },
  }
}

export function getNpmPackCacheRoot(
  cwd: string,
  options: {
    packageName: string
    version: string
  },
): string {
  return join(
    getAirulesAgentDir(cwd),
    'cache',
    'npm',
    sanitizePathSegment(options.packageName),
    sanitizePathSegment(options.version),
  )
}

async function fetchNpmMetadata(
  packageName: string,
): Promise<NpmPackageMetadata> {
  const encodedName = encodeNpmPackageName(packageName)
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
    headers: createNpmHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `npm registry request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ''}`,
    )
  }

  return (await response.json()) as NpmPackageMetadata
}

function resolveNpmVersion(
  metadata: NpmPackageMetadata,
  requestedVersion: string | undefined,
): string {
  if (requestedVersion !== undefined) {
    return requestedVersion
  }

  const latest = metadata['dist-tags']?.latest

  if (latest === undefined || latest.length === 0) {
    throw new Error(`Cannot resolve latest version for "${metadata.name}".`)
  }

  return latest
}

async function downloadNpmTarballToCache(options: {
  tarball: string
  cacheRoot: string
}): Promise<void> {
  const response = await fetch(options.tarball, {
    headers: createNpmHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `npm tarball request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ''}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (existsSync(options.cacheRoot)) {
    rmSync(options.cacheRoot, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(options.cacheRoot, {
    recursive: true,
  })

  const tarballPath = join(options.cacheRoot, 'package.tgz')
  writeFileSync(tarballPath, buffer)

  await tar.x({
    file: tarballPath,
    cwd: options.cacheRoot,
    strip: 1,
    filter: (entryPath, entry) => {
      const entryType = 'type' in entry ? String(entry.type) : ''
      return isSafeTarEntry(options.cacheRoot, entryPath, entryType)
    },
  })

  rmSync(tarballPath, {
    force: true,
  })
}

function isSafeTarEntry(
  cacheRoot: string,
  entryPath: string,
  entryType: string,
): boolean {
  if (
    entryType !== 'File' &&
    entryType !== 'Directory' &&
    entryType !== 'OldFile'
  ) {
    return false
  }

  const stripped = stripFirstSegment(entryPath)

  if (stripped.length === 0) {
    return true
  }

  const parts = stripped.split(/[\\/]/)
  if (parts.includes('..') || isAbsolute(stripped)) {
    return false
  }

  const target = resolve(cacheRoot, stripped)
  const relativePath = relative(cacheRoot, target)

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  )
}

function stripFirstSegment(value: string): string {
  return value.replace(/\\/g, '/').split('/').slice(1).join('/')
}

function createNpmHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'airules',
  }

  const token = process.env.NPM_TOKEN

  if (token !== undefined && token.length > 0) {
    headers.authorization = `Bearer ${token}`
  }

  return headers
}

function encodeNpmPackageName(packageName: string): string {
  return packageName.replace('/', '%2F')
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}

function findVersionAtIndex(value: string): number {
  if (value.startsWith('@')) {
    const slashIndex = value.indexOf('/')

    if (slashIndex === -1) {
      throw new Error(
        `Invalid scoped npm package "${value}". Expected @scope/name.`,
      )
    }

    return value.indexOf('@', slashIndex + 1)
  }

  return value.lastIndexOf('@')
}
```

---

# 2. 补 npm root 校验测试

## 修改 `packages/core/src/npm-source.test.ts`

追加这个测试：

```ts
it('throws when npm package does not contain airules.pack.json at package root', async () => {
  const cwd = createTempProject()
  const tarball = await createInvalidPackTarball()

  vi.stubGlobal('fetch', createMockFetch(tarball))

  await expect(
    resolveNpmPackSource('npm:@baicie/airules-react-shadcn@0.1.0', cwd),
  ).rejects.toThrow(/does not contain airules\.pack\.json/)
})

async function createInvalidPackTarball(): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'airules-npm-invalid-pack-'))
  const packageRoot = join(root, 'package')

  mkdirSync(join(packageRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(join(packageRoot, 'modules/core.md'), '## Core\n')

  const tarballPath = join(root, 'package.tgz')

  await tar.c(
    {
      gzip: true,
      file: tarballPath,
      cwd: root,
    },
    ['package'],
  )

  const buffer = readFileSync(tarballPath)

  rmSync(root, {
    recursive: true,
    force: true,
  })

  return buffer
}
```

确保文件顶部 import 有：

```ts
import { readFileSync } from 'node:fs'
```

---

# 3. 新增 e2e 测试

当前 `vitest.config.ts` 已经预留了 e2e project，匹配路径是 `packages/*/__tests__/e2e/*.spec.ts`。

## 新增 `packages/cli/__tests__/e2e/local-flow.spec.ts`

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
import { runAddCommand } from '../../src/commands/add'
import { runDiffCommand } from '../../src/commands/diff'
import { runDoctorCommand } from '../../src/commands/doctor'
import { runInitCommand } from '../../src/commands/init'
import { runPruneCommand } from '../../src/commands/prune'
import { runRemoveCommand } from '../../src/commands/remove'
import { runUpdateCommand } from '../../src/commands/update'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-e2e-local-'))

  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  mkdirSync(join(packRoot, 'files/.cursor/rules'), {
    recursive: true,
  })

  mkdirSync(join(packRoot, 'skills/shadcn-page'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
    JSON.stringify(
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        profiles: {
          default: {
            installs: ['codex', 'cursor', 'skill'],
          },
        },
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n\n- Use pnpm.\n')

  writeFileSync(
    join(packRoot, 'files/.cursor/rules/shadcn.mdc'),
    '---\ndescription: shadcn rules\n---\n\n# shadcn\n',
  )

  writeFileSync(
    join(packRoot, 'skills/shadcn-page/SKILL.md'),
    '---\nname: shadcn-page\n---\n\n# shadcn page skill\n',
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

describe('local airules flow', () => {
  it('runs init add doctor diff update remove prune', async () => {
    const cwd = createProject()

    await runInitCommand({
      cwd,
      force: true,
    })

    await runAddCommand({
      cwd,
      source: './packs/react-shadcn',
      agent: 'codex,cursor,skill',
    })

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain(
      'airules:start',
    )
    expect(
      readFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'utf8'),
    ).toContain('# shadcn')
    expect(
      readFileSync(join(cwd, '.agents/skills/shadcn-page/SKILL.md'), 'utf8'),
    ).toContain('shadcn page skill')

    await runDoctorCommand({
      cwd,
    })

    await runDiffCommand({
      cwd,
    })

    await runUpdateCommand({
      cwd,
    })

    await runRemoveCommand({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(false)

    await runPruneCommand({
      cwd,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).not.toContain('@baicie/react-shadcn')
  })
})
```

---

# 4. 新增 create/scaffold 能力

这是剩余里最有实际价值的功能。你后面要写很多 pack，手写目录太慢。

## 新增 `packages/core/src/scaffold.ts`

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface CreatePackOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateSkillOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateRegistryOptions {
  cwd: string
  force?: boolean
}

export interface ScaffoldResult {
  files: string[]
}

export function createPackScaffold(options: CreatePackOptions): ScaffoldResult {
  const safeName = normalizeName(options.name)
  const packName = options.name.startsWith('@')
    ? options.name
    : `@baicie/${safeName}`
  const root = join(options.cwd, 'packs', safeName)

  const files: string[] = []

  mkdirSync(join(root, 'modules'), {
    recursive: true,
  })
  mkdirSync(join(root, 'blocks'), {
    recursive: true,
  })
  mkdirSync(join(root, 'templates'), {
    recursive: true,
  })
  mkdirSync(join(root, 'files'), {
    recursive: true,
  })
  mkdirSync(join(root, 'skills', safeName), {
    recursive: true,
  })

  writeFileIfAllowed(
    join(root, 'airules.pack.json'),
    `${JSON.stringify(
      {
        $schema: 'https://baicie.github.io/airules/schema/pack.schema.json',
        name: packName,
        version: '0.1.0',
        description: `${safeName} AI coding rules`,
        keywords: [safeName],
        profiles: {
          default: {
            installs: ['codex-agents', 'skill-main'],
            variables: {
              packageManager: 'pnpm',
              requireTests: true,
            },
          },
        },
        modules: {
          core: 'modules/001-core.md',
        },
        blocks: {
          core: 'blocks/core.md',
        },
        installs: [
          {
            id: 'codex-agents',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            placement: {
              type: 'append',
            },
            concat: ['core'],
            merge: 'managed-block',
          },
          {
            id: 'skill-main',
            agent: 'skill',
            target: `.agents/skills/${safeName}`,
            mode: 'directory',
            from: `skills/${safeName}`,
            merge: 'overwrite-managed',
          },
        ],
      },
      null,
      2,
    )}\n`,
    options.force,
    files,
  )

  writeFileIfAllowed(
    join(root, 'modules/001-core.md'),
    `## ${safeName} Rules\n\n- Prefer simple, maintainable code.\n- Keep changes small and testable.\n`,
    options.force,
    files,
  )

  writeFileIfAllowed(
    join(root, 'blocks/core.md'),
    `## ${safeName} Block\n\nUse this block when generating agent-specific templates.\n`,
    options.force,
    files,
  )

  writeFileIfAllowed(
    join(root, 'templates/AGENTS.md.hbs'),
    `# Project Rules\n\n{{block "core"}}\n\npackageManager={{packageManager}}\n`,
    options.force,
    files,
  )

  writeFileIfAllowed(
    join(root, `skills/${safeName}/SKILL.md`),
    `---\nname: ${safeName}\ndescription: Use this skill for ${safeName} related coding tasks.\n---\n\n# ${safeName} Skill\n\n## Workflow\n\n1. Read project context.\n2. Follow installed airules guidance.\n3. Keep output concise and testable.\n`,
    options.force,
    files,
  )

  return {
    files,
  }
}

export function createSkillScaffold(
  options: CreateSkillOptions,
): ScaffoldResult {
  const safeName = normalizeName(options.name)
  const root = join(options.cwd, 'skills', safeName)
  const files: string[] = []

  mkdirSync(root, {
    recursive: true,
  })

  writeFileIfAllowed(
    join(root, 'SKILL.md'),
    `---\nname: ${safeName}\ndescription: Use this skill for ${safeName} related tasks.\n---\n\n# ${safeName} Skill\n\n## When to use\n\nUse this skill when the user asks for ${safeName} related help.\n\n## Workflow\n\n1. Inspect the relevant files.\n2. Make the smallest safe change.\n3. Validate the result.\n`,
    options.force,
    files,
  )

  return {
    files,
  }
}

export function createRegistryScaffold(
  options: CreateRegistryOptions,
): ScaffoldResult {
  const files: string[] = []
  const registryPath = join(options.cwd, 'registry.json')

  writeFileIfAllowed(
    registryPath,
    `${JSON.stringify(
      {
        $schema: 'https://baicie.github.io/airules/schema/registry.schema.json',
        name: '@baicie/default',
        version: '0.1.0',
        description: 'Default airules registry',
        packs: [],
      },
      null,
      2,
    )}\n`,
    options.force,
    files,
  )

  return {
    files,
  }
}

function writeFileIfAllowed(
  filePath: string,
  content: string,
  force: boolean | undefined,
  files: string[],
): void {
  if (existsSync(filePath) && force !== true) {
    return
  }

  writeFileSync(filePath, content)
  files.push(filePath)
}

function normalizeName(value: string): string {
  const withoutScope = value.startsWith('@')
    ? value.split('/').slice(1).join('/')
    : value

  return withoutScope
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}
```

---

## 修改 `packages/core/src/index.ts`

追加导出：

```ts
export * from './scaffold'
```

---

# 5. 新增 create CLI

## 新增 `packages/cli/src/commands/create.ts`

```ts
import {
  createPackScaffold,
  createRegistryScaffold,
  createSkillScaffold,
} from '@baicie/airules-core'

export interface CreatePackCommandOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateSkillCommandOptions {
  cwd: string
  name: string
  force?: boolean
}

export interface CreateRegistryCommandOptions {
  cwd: string
  force?: boolean
}

export async function runCreatePackCommand(
  options: CreatePackCommandOptions,
): Promise<void> {
  const result = createPackScaffold({
    cwd: options.cwd,
    name: options.name,
    force: options.force === true,
  })

  console.info('airules create pack')
  printFiles(result.files)
}

export async function runCreateSkillCommand(
  options: CreateSkillCommandOptions,
): Promise<void> {
  const result = createSkillScaffold({
    cwd: options.cwd,
    name: options.name,
    force: options.force === true,
  })

  console.info('airules create skill')
  printFiles(result.files)
}

export async function runCreateRegistryCommand(
  options: CreateRegistryCommandOptions,
): Promise<void> {
  const result = createRegistryScaffold({
    cwd: options.cwd,
    force: options.force === true,
  })

  console.info('airules create registry')
  printFiles(result.files)
}

function printFiles(files: string[]): void {
  if (files.length === 0) {
    console.info('- no files changed')
    return
  }

  for (const file of files) {
    console.info(`- created: ${file}`)
  }
}
```

---

## 修改 `packages/cli/src/bin.ts`

增加 import：

```ts
import {
  runCreatePackCommand,
  runCreateRegistryCommand,
  runCreateSkillCommand,
} from './commands/create'
```

在 `search` 命令前面加入：

```ts
cli
  .command('create pack <name>', 'Create an airules pack scaffold')
  .option('--force', 'Overwrite existing scaffold files')
  .action(async (name: string, options: { force?: boolean }) => {
    await runCreatePackCommand({
      cwd: process.cwd(),
      name,
      force: Boolean(options.force),
    })
  })

cli
  .command('create skill <name>', 'Create an airules skill scaffold')
  .option('--force', 'Overwrite existing skill files')
  .action(async (name: string, options: { force?: boolean }) => {
    await runCreateSkillCommand({
      cwd: process.cwd(),
      name,
      force: Boolean(options.force),
    })
  })

cli
  .command('create registry', 'Create a registry.json scaffold')
  .option('--force', 'Overwrite existing registry file')
  .action(async (options: { force?: boolean }) => {
    await runCreateRegistryCommand({
      cwd: process.cwd(),
      force: Boolean(options.force),
    })
  })
```

---

# 6. 补 scaffold 单元测试

## 新增 `packages/core/src/scaffold.test.ts`

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPackScaffold,
  createRegistryScaffold,
  createSkillScaffold,
} from './scaffold'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-scaffold-'))
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

describe('scaffold', () => {
  it('creates pack scaffold', () => {
    const cwd = createTempProject()

    const result = createPackScaffold({
      cwd,
      name: 'react-shadcn',
    })

    expect(result.files.length).toBeGreaterThan(0)
    expect(existsSync(join(cwd, 'packs/react-shadcn/airules.pack.json'))).toBe(
      true,
    )
    expect(
      existsSync(join(cwd, 'packs/react-shadcn/modules/001-core.md')),
    ).toBe(true)
    expect(
      existsSync(join(cwd, 'packs/react-shadcn/skills/react-shadcn/SKILL.md')),
    ).toBe(true)

    const pack = readFileSync(
      join(cwd, 'packs/react-shadcn/airules.pack.json'),
      'utf8',
    )

    expect(pack).toContain('@baicie/react-shadcn')
  })

  it('creates skill scaffold', () => {
    const cwd = createTempProject()

    createSkillScaffold({
      cwd,
      name: 'shadcn-page',
    })

    const skill = readFileSync(join(cwd, 'skills/shadcn-page/SKILL.md'), 'utf8')
    expect(skill).toContain('name: shadcn-page')
  })

  it('creates registry scaffold', () => {
    const cwd = createTempProject()

    createRegistryScaffold({
      cwd,
    })

    const registry = readFileSync(join(cwd, 'registry.json'), 'utf8')
    expect(registry).toContain('@baicie/default')
  })

  it('does not overwrite existing files unless force is true', () => {
    const cwd = createTempProject()

    createRegistryScaffold({
      cwd,
    })

    const registryPath = join(cwd, 'registry.json')
    const before = readFileSync(registryPath, 'utf8')

    createRegistryScaffold({
      cwd,
    })

    expect(readFileSync(registryPath, 'utf8')).toBe(before)

    createRegistryScaffold({
      cwd,
      force: true,
    })

    expect(readFileSync(registryPath, 'utf8')).toBe(before)
  })
})
```

---

## 新增 `packages/cli/src/commands/create.test.ts`

```ts
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runCreatePackCommand,
  runCreateRegistryCommand,
  runCreateSkillCommand,
} from './create'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-create-'))
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

describe('create commands', () => {
  it('creates pack scaffold', async () => {
    const cwd = createTempProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runCreatePackCommand({
      cwd,
      name: 'react-shadcn',
    })

    expect(existsSync(join(cwd, 'packs/react-shadcn/airules.pack.json'))).toBe(
      true,
    )

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules create pack')
  })

  it('creates skill scaffold', async () => {
    const cwd = createTempProject()

    await runCreateSkillCommand({
      cwd,
      name: 'shadcn-page',
    })

    expect(existsSync(join(cwd, 'skills/shadcn-page/SKILL.md'))).toBe(true)
  })

  it('creates registry scaffold', async () => {
    const cwd = createTempProject()

    await runCreateRegistryCommand({
      cwd,
    })

    expect(existsSync(join(cwd, 'registry.json'))).toBe(true)
  })
})
```

---

# 7. 补真实 `react-shadcn` 最小包

## 新增 `packs/react-shadcn/airules.pack.json`

```json
{
  "$schema": "https://baicie.github.io/airules/schema/pack.schema.json",
  "name": "@baicie/react-shadcn",
  "version": "0.1.0",
  "description": "React + shadcn/ui AI coding rules",
  "license": "MIT",
  "keywords": ["react", "shadcn", "tailwind", "frontend"],
  "profiles": {
    "default": {
      "installs": [
        "codex-agents",
        "cursor-shadcn",
        "copilot-main",
        "skill-shadcn-page"
      ],
      "variables": {
        "packageManager": "pnpm",
        "uiAlias": "@/components/ui",
        "requireTests": true
      }
    }
  },
  "modules": {
    "core": "modules/001-core.md",
    "react": "modules/010-react.md",
    "shadcn": "modules/020-shadcn.md",
    "testing": "modules/030-testing.md"
  },
  "blocks": {
    "shadcn": "blocks/shadcn.md"
  },
  "installs": [
    {
      "id": "codex-agents",
      "agent": "codex",
      "target": "AGENTS.md",
      "mode": "modules",
      "placement": {
        "type": "append"
      },
      "concat": ["core", "react", "shadcn", "testing"],
      "merge": "managed-block"
    },
    {
      "id": "cursor-shadcn",
      "agent": "cursor",
      "target": ".cursor/rules/shadcn.mdc",
      "mode": "file",
      "from": "files/.cursor/rules/shadcn.mdc",
      "merge": "overwrite-managed"
    },
    {
      "id": "copilot-main",
      "agent": "copilot",
      "target": ".github/copilot-instructions.md",
      "mode": "modules",
      "placement": {
        "type": "append"
      },
      "concat": ["core", "react", "shadcn"],
      "merge": "managed-block"
    },
    {
      "id": "skill-shadcn-page",
      "agent": "skill",
      "target": ".agents/skills/shadcn-page",
      "mode": "directory",
      "from": "skills/shadcn-page",
      "merge": "overwrite-managed"
    }
  ]
}
```

## 新增 `packs/react-shadcn/modules/001-core.md`

```md
## Core Rules

- Use TypeScript for application code.
- Prefer small, focused components.
- Keep changes easy to review.
- Prefer `pnpm` when package manager is not specified.
```

## 新增 `packs/react-shadcn/modules/010-react.md`

```md
## React Rules

- Prefer function components.
- Keep component props explicit and typed.
- Avoid unnecessary global state.
- Extract reusable UI logic into hooks only when it is shared.
```

## 新增 `packs/react-shadcn/modules/020-shadcn.md`

```md
## shadcn/ui Rules

- Prefer existing shadcn/ui primitives before creating new custom UI.
- Keep generated components close to the app conventions.
- Do not rewrite the whole design system for a small feature.
- Keep class names readable and avoid over-nesting Tailwind utilities.
```

## 新增 `packs/react-shadcn/modules/030-testing.md`

```md
## Testing Rules

- Add unit tests for non-trivial logic.
- Add interaction tests for complex UI behavior.
- Do not mock everything; prefer testing visible behavior.
```

## 新增 `packs/react-shadcn/blocks/shadcn.md`

```md
## shadcn Block

When implementing UI:

- Check whether an existing shadcn/ui component can be reused.
- Keep accessibility states visible.
- Keep variants explicit and documented.
```

## 新增 `packs/react-shadcn/files/.cursor/rules/shadcn.mdc`

```md
---
description: React shadcn/ui coding rules
globs:
  - '**/*.{ts,tsx}'
---

# React shadcn/ui Rules

- Prefer existing shadcn/ui primitives.
- Keep component APIs typed and explicit.
- Avoid unnecessary abstractions.
- Add tests for important UI behavior.
```

## 新增 `packs/react-shadcn/skills/shadcn-page/SKILL.md`

```md
---
name: shadcn-page
description: Use this skill when creating or modifying React pages that use shadcn/ui components.
---

# shadcn Page Skill

## Workflow

1. Inspect existing UI components and project conventions.
2. Prefer shadcn/ui primitives before custom components.
3. Keep layout and state simple.
4. Add tests for important interactions.
5. Summarize changed files and validation commands.
```

---

# 8. 新增 registry 初始内容

## 新增/更新 `registry.json`

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
    }
  ]
}
```

---

# 9. 新增 release 前 checklist 文档

## 新增 `docs/release-checklist.md`

````md
# Release Checklist

## Local validation

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
```
````

## Pack validation

```bash
node packages/cli/dist/bin.js pack validate ./packs/react-shadcn
node packages/cli/dist/bin.js pack build ./packs/react-shadcn --out dist/airules/react-shadcn
```

## Registry validation

```bash
node packages/cli/dist/bin.js registry list --registry ./registry.json
node packages/cli/dist/bin.js search shadcn --registry ./registry.json
```

## Local dogfood

```bash
mkdir -p temp/dogfood
cd temp/dogfood

node ../../packages/cli/dist/bin.js init --force
node ../../packages/cli/dist/bin.js add ../../packs/react-shadcn --agent codex,cursor,skill
node ../../packages/cli/dist/bin.js doctor
node ../../packages/cli/dist/bin.js diff
node ../../packages/cli/dist/bin.js remove @baicie/react-shadcn --dry-run
```

## Expected files

```txt
AGENTS.md
.cursor/rules/shadcn.mdc
.agents/skills/shadcn-page/SKILL.md
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
```

## Publish beta

```bash
pnpm build
pnpm --filter @baicie/airules publish --tag beta --access public
```

````

---

# 10. 更新 README 最小使用文档

## 新增/替换 `README.md`

```md
# ai-rules

AI Rules Pack Manager for coding agents.

`airules` installs reusable AI coding rules into:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*.mdc`
- `.github/copilot-instructions.md`
- `.agents/skills/*`
- `docs/ai/*`

## Install

```bash
pnpm dlx @baicie/airules init
````

## Add local pack

```bash
pnpm dlx @baicie/airules add ./packs/react-shadcn --agent codex,cursor,skill
```

## Add registry alias

```bash
pnpm dlx @baicie/airules add shadcn --agent codex,cursor
```

## Commands

```bash
airules init
airules add <source>
airules update
airules diff
airules doctor
airules remove <pack>
airules prune
airules list

airules search [query]
airules registry list
airules registry publish <pack>

airules pack validate <pack>
airules pack build <pack>

airules create pack <name>
airules create skill <name>
airules create registry
```

## Source formats

```txt
./packs/react-shadcn
local:./packs/react-shadcn
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
npm:@baicie/airules-react-shadcn@0.1.0
shadcn
@baicie/react-shadcn
```

## Local state

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   ├── staged/
│   └── state.json
└── skills/
```

````

---

# 最后还要跑的验证命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
````

然后手动跑：

```bash
node packages/cli/dist/bin.js create pack demo --force
node packages/cli/dist/bin.js pack validate ./packs/react-shadcn
node packages/cli/dist/bin.js pack build ./packs/react-shadcn --out dist/airules/react-shadcn
node packages/cli/dist/bin.js registry list --registry ./registry.json
node packages/cli/dist/bin.js search shadcn --registry ./registry.json
node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex,cursor,skill --dry-run
node packages/cli/dist/bin.js add ./packs/react-shadcn --agent codex,cursor,skill
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js remove @baicie/react-shadcn --dry-run
```

---

# 建议提交信息

```txt
feat: add scaffold commands and beta release readiness
```

---

# 剩余完成度

补完上面这些后：

```txt
MVP demo：95%
自用 dogfood：85%
0.1.0-beta：80%
正式 0.1.0：60%
```

正式版还差的不是代码能力，而是：

```txt
真实 dogfood
更多 pack 内容质量
GitHub Actions release
npm provenance
文档站
实际发布验证
```
