# Phase 6：npm source / pack validate / pack build / registry publish

## 目标

Phase 6 做四件事：

```txt
1. 支持 npm source
   airules add npm:@baicie/airules-react-shadcn
   airules add npm:@baicie/airules-react-shadcn@0.1.0

2. 支持 pack validate
   airules pack validate ./packs/react-shadcn

3. 支持 pack build
   airules pack build ./packs/react-shadcn --out dist/airules/react-shadcn

4. 支持 registry publish
   airules registry publish ./packs/react-shadcn \
     --registry ./registry.json \
     --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

这里的 `registry publish` 不是 npm publish，而是把 pack 信息写入 `registry.json`。

---

## Phase 6 边界

### 做

```txt
npm registry metadata 解析
npm tarball 下载
npm pack 解压到 .agents/agent/cache/npm
pack validate
pack build 到目录
registry.json 本地更新
CLI 命令
完整单元测试
```

### 不做

```txt
不执行 npm publish
不写 GitHub 远程 registry 文件
不做 npm token 管理
不做 semver range 解析，只支持 latest 或精确版本
```

---

## 需要修改的文件

```txt
packages/core/package.json

packages/core/src/
├── npm-source.ts              # 新增
├── source.ts                  # 修改，支持 npm source
├── pack-validator.ts          # 新增
├── pack-builder.ts            # 新增
├── registry-publish.ts        # 新增
├── index.ts                   # 修改导出
├── npm-source.test.ts         # 新增
├── pack-validator.test.ts     # 新增
├── pack-builder.test.ts       # 新增
└── registry-publish.test.ts   # 新增

packages/cli/src/
├── bin.ts                     # 修改，增加 pack / registry publish 命令
└── commands/
    ├── pack.ts                # 新增
    └── registry-publish.ts    # 新增

docs/
└── phase6.md                  # 新增
```

---

# 1. 修改 `packages/core/package.json`

加 `tar` 依赖。

```json
{
  "name": "@baicie/airules-core",
  "version": "0.0.0",
  "type": "module",
  "private": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run src/**/*.test.ts",
    "typecheck": "tsc -p ../../tsconfig.json --noEmit"
  },
  "dependencies": {
    "@baicie/airules-schema": "workspace:*",
    "jiti": "^2.4.2",
    "tar": "^7.4.3"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
```

---

# 2. 新增 `packages/core/src/npm-source.ts`

```ts
import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

  if (!body) {
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

  if (!packageName) {
    throw new Error(`Invalid npm source "${source}". Missing package name.`)
  }

  if (!version) {
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
  if (requestedVersion) {
    return requestedVersion
  }

  const latest = metadata['dist-tags']?.latest

  if (!latest) {
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
  })

  rmSync(tarballPath, {
    force: true,
  })
}

function createNpmHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'airules',
  }

  const token = process.env.NPM_TOKEN

  if (token && token.length > 0) {
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

# 3. 修改 `packages/core/src/source.ts`

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
import {
  isNpmSource,
  resolveNpmPackSource,
  type ResolvedNpmPackSource,
} from './npm-source'

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
  | ResolvedNpmPackSource

export async function resolvePackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedAnyPackSource> {
  if (isGitHubSource(source)) {
    return resolveGitHubPackSource(source, cwd)
  }

  if (isNpmSource(source)) {
    return resolveNpmPackSource(source, cwd)
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
    throw new Error('Use resolvePackSource() for npm sources.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported as direct pack source.')
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

# 4. 新增 `packages/core/src/pack-validator.ts`

```ts
import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { existsSync, statSync } from 'node:fs'
import { AirulesPackSchema } from '@baicie/airules-schema'
import { loadLocalPack } from './pack-loader'
import { safeResolveInside } from './path-utils'
import { resolveLocalPackSource } from './source'

export type PackValidationSeverity = 'error' | 'warning' | 'ok'

export interface PackValidationIssue {
  severity: PackValidationSeverity
  code: string
  message: string
  installId?: string
  path?: string
}

export interface ValidatePackOptions {
  cwd?: string
  packPath: string
}

export interface ValidatePackResult {
  ok: boolean
  packName?: string
  packVersion?: string
  issues: PackValidationIssue[]
}

export function validatePack(options: ValidatePackOptions): ValidatePackResult {
  const cwd = options.cwd ?? process.cwd()
  const issues: PackValidationIssue[] = []

  let loaded: ReturnType<typeof loadLocalPack>

  try {
    loaded = loadLocalPack(resolveLocalPackSource(options.packPath, cwd))
    AirulesPackSchema.parse(loaded.pack)
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'pack-invalid',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  issues.push({
    severity: 'ok',
    code: 'pack-schema-valid',
    message: 'airules.pack.json schema is valid.',
  })

  const duplicatedInstallIds = findDuplicateInstallIds(loaded.pack.installs)
  for (const installId of duplicatedInstallIds) {
    issues.push({
      severity: 'error',
      code: 'duplicate-install-id',
      message: `Duplicate install id "${installId}".`,
      installId,
    })
  }

  for (const install of loaded.pack.installs) {
    issues.push(
      ...validateInstall({
        pack: loaded.pack,
        packRoot: loaded.root,
        install,
      }),
    )
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    packName: loaded.pack.name,
    packVersion: loaded.pack.version,
    issues,
  }
}

export function assertPackValid(options: ValidatePackOptions): void {
  const result = validatePack(options)

  if (!result.ok) {
    const message = result.issues
      .filter(issue => issue.severity === 'error')
      .map(issue => `${issue.code}: ${issue.message}`)
      .join('\n')

    throw new Error(message || 'Pack validation failed.')
  }
}

function validateInstall(options: {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
}): PackValidationIssue[] {
  const issues: PackValidationIssue[] = []
  const install = options.install

  if (install.mode === 'modules') {
    const modules = options.pack.modules

    if (!modules) {
      issues.push({
        severity: 'error',
        code: 'modules-missing',
        message: `Install "${install.id}" uses modules mode but pack.modules is missing.`,
        installId: install.id,
      })
      return issues
    }

    for (const moduleId of install.concat ?? []) {
      const modulePath = modules[moduleId]

      if (!modulePath) {
        issues.push({
          severity: 'error',
          code: 'module-id-missing',
          message: `Install "${install.id}" references missing module "${moduleId}".`,
          installId: install.id,
        })
        continue
      }

      issues.push(
        validateFileExists(options.packRoot, modulePath, {
          code: 'module-file-missing',
          installId: install.id,
          label: `module "${moduleId}"`,
        }),
      )
    }

    return issues
  }

  if (install.mode === 'template') {
    if (install.template) {
      issues.push(
        validateFileExists(options.packRoot, install.template, {
          code: 'template-file-missing',
          installId: install.id,
          label: 'template',
        }),
      )
    }

    for (const blockId of install.blocks ?? []) {
      const blockPath = options.pack.blocks?.[blockId]

      if (!blockPath) {
        issues.push({
          severity: 'error',
          code: 'block-id-missing',
          message: `Install "${install.id}" references missing block "${blockId}".`,
          installId: install.id,
        })
        continue
      }

      issues.push(
        validateFileExists(options.packRoot, blockPath, {
          code: 'block-file-missing',
          installId: install.id,
          label: `block "${blockId}"`,
        }),
      )
    }

    return issues
  }

  if (install.mode === 'file') {
    if (install.from) {
      issues.push(
        validateFileExists(options.packRoot, install.from, {
          code: 'source-file-missing',
          installId: install.id,
          label: 'file source',
        }),
      )
    }

    return issues
  }

  if (install.mode === 'directory') {
    if (install.from) {
      issues.push(
        validateDirectoryExists(options.packRoot, install.from, {
          code: 'source-directory-missing',
          installId: install.id,
          label: 'directory source',
        }),
      )
    }

    return issues
  }

  return issues
}

function validateFileExists(
  packRoot: string,
  relativePath: string,
  options: {
    code: string
    installId: string
    label: string
  },
): PackValidationIssue {
  try {
    const absolutePath = safeResolveInside(
      packRoot,
      relativePath,
      options.label,
    )

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return {
        severity: 'error',
        code: options.code,
        message: `${options.label} does not exist: ${relativePath}`,
        installId: options.installId,
        path: relativePath,
      }
    }

    return {
      severity: 'ok',
      code: 'file-exists',
      message: `${options.label} exists: ${relativePath}`,
      installId: options.installId,
      path: relativePath,
    }
  } catch (error) {
    return {
      severity: 'error',
      code: options.code,
      message: error instanceof Error ? error.message : String(error),
      installId: options.installId,
      path: relativePath,
    }
  }
}

function validateDirectoryExists(
  packRoot: string,
  relativePath: string,
  options: {
    code: string
    installId: string
    label: string
  },
): PackValidationIssue {
  try {
    const absolutePath = safeResolveInside(
      packRoot,
      relativePath,
      options.label,
    )

    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      return {
        severity: 'error',
        code: options.code,
        message: `${options.label} does not exist: ${relativePath}`,
        installId: options.installId,
        path: relativePath,
      }
    }

    return {
      severity: 'ok',
      code: 'directory-exists',
      message: `${options.label} exists: ${relativePath}`,
      installId: options.installId,
      path: relativePath,
    }
  } catch (error) {
    return {
      severity: 'error',
      code: options.code,
      message: error instanceof Error ? error.message : String(error),
      installId: options.installId,
      path: relativePath,
    }
  }
}

function findDuplicateInstallIds(installs: AirulesInstall[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const install of installs) {
    if (seen.has(install.id)) {
      duplicates.add(install.id)
    }

    seen.add(install.id)
  }

  return Array.from(duplicates)
}
```

---

# 5. 新增 `packages/core/src/pack-builder.ts`

```ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { sha256 } from './hash'
import { loadLocalPack } from './pack-loader'
import {
  ensureParentDirectory,
  listTextFilesRecursively,
  readTextFile,
  safeResolveInside,
  toPosixPath,
} from './path-utils'
import { assertPackValid } from './pack-validator'
import { resolveLocalPackSource } from './source'

export interface BuildPackOptions {
  cwd?: string
  packPath: string
  outDir?: string
  clean?: boolean
}

export interface BuildPackFile {
  path: string
  hash: string
}

export interface BuildPackResult {
  outDir: string
  packName: string
  packVersion: string
  files: BuildPackFile[]
  hash: string
}

export function buildPack(options: BuildPackOptions): BuildPackResult {
  const cwd = options.cwd ?? process.cwd()
  assertPackValid({
    cwd,
    packPath: options.packPath,
  })

  const source = resolveLocalPackSource(options.packPath, cwd)
  const loaded = loadLocalPack(source)
  const outDir =
    options.outDir ??
    join(
      cwd,
      '.agents',
      'agent',
      'build',
      `${sanitizeFileName(loaded.pack.name)}-${loaded.pack.version}`,
    )

  const absoluteOutDir = safeResolveInside(cwd, outDir, 'build output')

  if (options.clean !== false && existsSync(absoluteOutDir)) {
    rmSync(absoluteOutDir, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(absoluteOutDir, {
    recursive: true,
  })

  const sourceFiles = listTextFilesRecursively(loaded.root)
  const files: BuildPackFile[] = []

  for (const sourceFile of sourceFiles) {
    const relativePath = toPosixPath(relative(loaded.root, sourceFile))
    const targetPath = safeResolveInside(
      absoluteOutDir,
      relativePath,
      'build file',
    )
    const content = readTextFile(sourceFile)

    ensureParentDirectory(targetPath)
    writeFileSync(targetPath, content)

    files.push({
      path: relativePath,
      hash: sha256(content),
    })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  const manifest = {
    name: loaded.pack.name,
    version: loaded.pack.version,
    source: options.packPath,
    files,
    hash: hashBuildFiles(files),
  }

  writeFileSync(
    join(absoluteOutDir, 'airules.build.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  return {
    outDir: absoluteOutDir,
    packName: loaded.pack.name,
    packVersion: loaded.pack.version,
    files,
    hash: manifest.hash,
  }
}

function hashBuildFiles(files: BuildPackFile[]): string {
  return sha256(files.map(file => `${file.path}\0${file.hash}`).join('\0'))
}

function sanitizeFileName(value: string): string {
  const name = value.replace(/[^\w.-]/g, '_')
  return name || basename(value)
}
```

---

# 6. 新增 `packages/core/src/registry-publish.ts`

```ts
import type {
  AirulesRegistry,
  AirulesRegistryPack,
} from '@baicie/airules-schema'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { AirulesRegistrySchema } from '@baicie/airules-schema'
import { loadLocalPack } from './pack-loader'
import { assertPackValid } from './pack-validator'
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
  if (description) {
    packEntry.description = description
  }

  const tags = options.tags ?? loaded.pack.keywords
  if (tags && tags.length > 0) {
    packEntry.tags = dedupe(tags)
  }

  if (options.aliases && options.aliases.length > 0) {
    packEntry.aliases = dedupe(options.aliases)
  }

  if (options.homepage) {
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

  registry.packs.sort((a, b) => a.name.localeCompare(b.name))

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
```

---

# 7. 修改 `packages/core/src/index.ts`

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
export * from './npm-source'
export * from './pack-builder'
export * from './pack-loader'
export * from './pack-validator'
export * from './path-utils'
export * from './profile'
export * from './prune'
export * from './registry'
export * from './registry-publish'
export * from './remove'
export * from './security'
export * from './source'
export * from './template-renderer'
```

---

# 8. 新增 CLI：`packages/cli/src/commands/pack.ts`

```ts
import { buildPack, validatePack } from '@baicie/airules-core'

export interface PackValidateCommandOptions {
  cwd: string
  packPath: string
}

export interface PackBuildCommandOptions {
  cwd: string
  packPath: string
  out?: string
  noClean?: boolean
}

export async function runPackValidateCommand(
  options: PackValidateCommandOptions,
): Promise<void> {
  const result = validatePack({
    cwd: options.cwd,
    packPath: options.packPath,
  })

  console.info('airules pack validate')

  for (const issue of result.issues) {
    const prefix =
      issue.severity === 'ok' ? '✔' : issue.severity === 'warning' ? '⚠' : '✖'

    console.info(`${prefix} ${issue.code}: ${issue.message}`)
  }

  if (!result.ok) {
    process.exitCode = 1
  }
}

export async function runPackBuildCommand(
  options: PackBuildCommandOptions,
): Promise<void> {
  const result = buildPack({
    cwd: options.cwd,
    packPath: options.packPath,
    outDir: options.out,
    clean: options.noClean !== true,
  })

  console.info('airules pack build')
  console.info(`- pack: ${result.packName}@${result.packVersion}`)
  console.info(`- out: ${result.outDir}`)
  console.info(`- files: ${result.files.length}`)
  console.info(`- hash: ${result.hash}`)
}
```

---

# 9. 新增 CLI：`packages/cli/src/commands/registry-publish.ts`

```ts
import { publishPackToRegistry } from '@baicie/airules-core'

export interface RegistryPublishCommandOptions {
  cwd: string
  packPath: string
  registry: string
  source: string
  alias?: string
  tag?: string
  description?: string
  homepage?: string
  deprecated?: string | boolean
}

export async function runRegistryPublishCommand(
  options: RegistryPublishCommandOptions,
): Promise<void> {
  const result = publishPackToRegistry({
    cwd: options.cwd,
    packPath: options.packPath,
    registryPath: options.registry,
    source: options.source,
    aliases: parseList(options.alias),
    tags: parseList(options.tag),
    description: options.description,
    homepage: options.homepage,
    deprecated: options.deprecated,
  })

  console.info('airules registry publish')
  console.info(`- action: ${result.action}`)
  console.info(`- registry: ${result.registryPath}`)
  console.info(`- pack: ${result.pack.name}`)
  console.info(`- source: ${result.pack.source}`)
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined
  }

  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}
```

---

# 10. 修改 CLI：`packages/cli/src/bin.ts`

增加 `pack validate`、`pack build`、`registry publish`。

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
import { runPackBuildCommand, runPackValidateCommand } from './commands/pack'
import { runPruneCommand } from './commands/prune'
import { runRegistryListCommand } from './commands/registry'
import { runRegistryPublishCommand } from './commands/registry-publish'
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
    .command('pack validate <pack>', 'Validate an airules pack')
    .action(async (packPath: string) => {
      await runPackValidateCommand({
        cwd: process.cwd(),
        packPath,
      })
    })

  cli
    .command(
      'pack build <pack>',
      'Build an airules pack into an output directory',
    )
    .option('--out <out>', 'Output directory')
    .option('--no-clean', 'Do not clean output directory before build')
    .action(
      async (
        packPath: string,
        options: {
          out?: string
          clean?: boolean
        },
      ) => {
        await runPackBuildCommand({
          cwd: process.cwd(),
          packPath,
          out: options.out,
          noClean: options.clean === false,
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
    .command(
      'registry publish <pack>',
      'Publish a pack entry into registry.json',
    )
    .option('--registry <registry>', 'Registry json path')
    .option('--source <source>', 'Resolved source to write into registry')
    .option('--alias <aliases>', 'Comma-separated aliases')
    .option('--tag <tags>', 'Comma-separated tags')
    .option('--description <description>', 'Override description')
    .option('--homepage <homepage>', 'Homepage URL')
    .option('--deprecated <reason>', 'Mark as deprecated')
    .action(
      async (
        packPath: string,
        options: {
          registry?: string
          source?: string
          alias?: string
          tag?: string
          description?: string
          homepage?: string
          deprecated?: string
        },
      ) => {
        if (!options.registry) {
          throw new Error('--registry is required.')
        }

        if (!options.source) {
          throw new Error('--source is required.')
        }

        await runRegistryPublishCommand({
          cwd: process.cwd(),
          packPath,
          registry: options.registry,
          source: options.source,
          alias: options.alias,
          tag: options.tag,
          description: options.description,
          homepage: options.homepage,
          deprecated: options.deprecated,
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

## `packages/core/src/npm-source.test.ts`

```ts
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tar from 'tar'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getNpmPackCacheRoot,
  parseNpmSource,
  resolveNpmPackSource,
} from './npm-source'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-npm-'))
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

describe('parseNpmSource', () => {
  it('parses unscoped package without version', () => {
    expect(parseNpmSource('npm:airules-react')).toEqual({
      packageName: 'airules-react',
    })
  })

  it('parses unscoped package with version', () => {
    expect(parseNpmSource('npm:airules-react@0.1.0')).toEqual({
      packageName: 'airules-react',
      version: '0.1.0',
    })
  })

  it('parses scoped package with version', () => {
    expect(parseNpmSource('npm:@baicie/airules-react-shadcn@0.1.0')).toEqual({
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })
  })
})

describe('resolveNpmPackSource', () => {
  it('downloads npm tarball into cache', async () => {
    const cwd = createTempProject()
    const tarball = await createPackTarball()

    vi.stubGlobal('fetch', createMockFetch(tarball))

    const resolved = await resolveNpmPackSource(
      'npm:@baicie/airules-react-shadcn@0.1.0',
      cwd,
    )

    expect(resolved.resolved).toEqual({
      type: 'npm',
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })

    expect(existsSync(join(resolved.root, 'airules.pack.json'))).toBe(true)
    expect(existsSync(join(resolved.root, 'modules/core.md'))).toBe(true)
  })

  it('creates deterministic cache root', () => {
    const cacheRoot = getNpmPackCacheRoot('/repo', {
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })

    expect(cacheRoot).toMatch(
      /[\\/]repo[\\/]\.agents[\\/]agent[\\/]cache[\\/]npm[\\/]_baicie_airules-react-shadcn[\\/]0\.1\.0$/,
    )
  })
})

async function createPackTarball(): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'airules-npm-pack-'))
  const packageRoot = join(root, 'package')

  mkdirSync(join(packageRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packageRoot, 'airules.pack.json'),
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

  const buffer = Buffer.from(
    await import('node:fs').then(fs => fs.readFileSync(tarballPath)),
  )

  rmSync(root, {
    recursive: true,
    force: true,
  })

  return buffer
}

function createMockFetch(tarball: Buffer): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://registry.npmjs.org/@baicie%2Fairules-react-shadcn') {
      return createJsonResponse({
        name: '@baicie/airules-react-shadcn',
        'dist-tags': {
          latest: '0.1.0',
        },
        versions: {
          '0.1.0': {
            version: '0.1.0',
            dist: {
              tarball: 'https://registry.npmjs.org/tarball.tgz',
            },
          },
        },
      })
    }

    if (url === 'https://registry.npmjs.org/tarball.tgz') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () =>
          tarball.buffer.slice(
            tarball.byteOffset,
            tarball.byteOffset + tarball.byteLength,
          ),
      } as Response
    }

    return createJsonResponse({ message: `Unexpected URL: ${url}` }, 404)
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

## `packages/core/src/pack-validator.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validatePack } from './pack-validator'

let currentTmpDir: string | null = null

function createPack(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-validate-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

  return packRoot
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

describe('validatePack', () => {
  it('validates a correct pack', () => {
    const packRoot = createPack()

    const result = validatePack({
      packPath: packRoot,
    })

    expect(result.ok).toBe(true)
    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(
      result.issues.some(issue => issue.code === 'pack-schema-valid'),
    ).toBe(true)
  })

  it('reports missing module file', () => {
    const packRoot = createPack()

    writeFileSync(
      join(packRoot, 'airules.pack.json'),
      JSON.stringify({
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        modules: {
          core: 'modules/missing.md',
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

    const result = validatePack({
      packPath: packRoot,
    })

    expect(result.ok).toBe(false)
    expect(
      result.issues.some(issue => issue.code === 'module-file-missing'),
    ).toBe(true)
  })
})
```

---

## `packages/core/src/pack-builder.test.ts`

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
import { buildPack } from './pack-builder'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-build-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  return {
    cwd: currentTmpDir,
    packRoot,
  }
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

describe('buildPack', () => {
  it('builds pack into output directory', () => {
    const { cwd, packRoot } = createPack()
    const out = join(cwd, 'dist/react-shadcn')

    const result = buildPack({
      cwd,
      packPath: packRoot,
      outDir: out,
    })

    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(existsSync(join(out, 'airules.pack.json'))).toBe(true)
    expect(existsSync(join(out, 'modules/core.md'))).toBe(true)
    expect(existsSync(join(out, 'airules.build.json'))).toBe(true)

    const manifest = readFileSync(join(out, 'airules.build.json'), 'utf8')
    expect(manifest).toContain('@baicie/react-shadcn')
  })
})
```

---

## `packages/core/src/registry-publish.test.ts`

```ts
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
import { publishPackToRegistry } from './registry-publish'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-registry-publish-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
    JSON.stringify({
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      description: 'React shadcn rules',
      keywords: ['react', 'shadcn'],
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  return {
    cwd: currentTmpDir,
    packRoot,
  }
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

describe('publishPackToRegistry', () => {
  it('creates registry json and writes pack entry', () => {
    const { cwd, packRoot } = createPack()

    const result = publishPackToRegistry({
      cwd,
      packPath: packRoot,
      registryPath: './registry.json',
      source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      aliases: ['shadcn'],
    })

    expect(result.action).toBe('create-registry')
    expect(result.pack.name).toBe('@baicie/react-shadcn')

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )
    expect(registry.packs[0].name).toBe('@baicie/react-shadcn')
    expect(registry.packs[0].aliases).toEqual(['shadcn'])
    expect(registry.packs[0].tags).toEqual(['react', 'shadcn'])
  })

  it('updates existing pack entry', () => {
    const { cwd, packRoot } = createPack()

    writeFileSync(
      join(cwd, 'registry.json'),
      JSON.stringify({
        packs: [
          {
            name: '@baicie/react-shadcn',
            source: './old',
          },
        ],
      }),
    )

    const result = publishPackToRegistry({
      cwd,
      packPath: packRoot,
      registryPath: './registry.json',
      source: './new',
    })

    expect(result.action).toBe('update-pack')

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )
    expect(registry.packs).toHaveLength(1)
    expect(registry.packs[0].source).toBe('./new')
  })
})
```

---

## `packages/cli/src/commands/pack.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPackBuildCommand, runPackValidateCommand } from './pack'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-pack-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  return {
    cwd: currentTmpDir,
    packRoot,
  }
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

describe('pack commands', () => {
  it('prints validate result', async () => {
    const { cwd, packRoot } = createPack()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runPackValidateCommand({
      cwd,
      packPath: packRoot,
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules pack validate')
    expect(output).toContain('pack-schema-valid')
  })

  it('prints build result', async () => {
    const { cwd, packRoot } = createPack()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runPackBuildCommand({
      cwd,
      packPath: packRoot,
      out: join(cwd, 'dist/react-shadcn'),
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules pack build')
    expect(output).toContain('@baicie/react-shadcn@0.1.0')
  })
})
```

---

## `packages/cli/src/commands/registry-publish.test.ts`

```ts
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
import { runRegistryPublishCommand } from './registry-publish'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-registry-publish-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  return {
    cwd: currentTmpDir,
    packRoot,
  }
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

describe('runRegistryPublishCommand', () => {
  it('writes registry entry', async () => {
    const { cwd, packRoot } = createPack()

    await runRegistryPublishCommand({
      cwd,
      packPath: packRoot,
      registry: './registry.json',
      source: './packs/react-shadcn',
      alias: 'shadcn,react-shadcn',
      tag: 'react,shadcn',
    })

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )

    expect(registry.packs[0].name).toBe('@baicie/react-shadcn')
    expect(registry.packs[0].aliases).toEqual(['shadcn', 'react-shadcn'])
    expect(registry.packs[0].tags).toEqual(['react', 'shadcn'])
  })
})
```

---

# 12. 新增 `docs/phase6.md`

````md
# Phase 6 Design

## Goal

Phase 6 adds npm source support and pack publishing workflow.

## Supported

```txt
npm source
pack validate
pack build
registry publish
```
````

## npm source

```bash
airules add npm:@baicie/airules-react-shadcn
airules add npm:@baicie/airules-react-shadcn@0.1.0
```

Resolution:

```txt
1. Read npm metadata from registry.npmjs.org.
2. Resolve latest or exact version.
3. Download tarball.
4. Extract into .agents/agent/cache/npm.
5. Load airules.pack.json from extracted package root.
```

## pack validate

```bash
airules pack validate ./packs/react-shadcn
```

Checks:

```txt
airules.pack.json schema
duplicate install id
module id exists
module file exists
template file exists
block id exists
block file exists
file source exists
directory source exists
```

## pack build

```bash
airules pack build ./packs/react-shadcn --out dist/airules/react-shadcn
```

Build output:

```txt
dist/airules/react-shadcn/
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
├── skills/
└── airules.build.json
```

## registry publish

```bash
airules registry publish ./packs/react-shadcn \
  --registry ./registry.json \
  --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --alias shadcn,react-shadcn \
  --tag react,shadcn
```

This updates local `registry.json`.

It does not run `npm publish`.

## npm package layout

An npm airules pack should contain:

```txt
package/
├── package.json
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
└── skills/
```

After extraction with `strip: 1`, `airules.pack.json` must be at cache root.

````

---

# 验证命令

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
````

手动验证：

```bash
pnpm --filter @baicie/airules build

node packages/cli/dist/bin.js pack validate ./packs/react-shadcn

node packages/cli/dist/bin.js pack build ./packs/react-shadcn --out dist/airules/react-shadcn

node packages/cli/dist/bin.js registry publish ./packs/react-shadcn \
  --registry ./registry.json \
  --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --alias shadcn,react-shadcn \
  --tag react,shadcn

node packages/cli/dist/bin.js add npm:@baicie/airules-react-shadcn@0.1.0 --agent codex --dry-run
```

---

# Phase 6 验收标准

```txt
1. npm:@scope/name 能解析 latest。
2. npm:@scope/name@version 能解析指定版本。
3. npm tarball 能解压到 .agents/agent/cache/npm。
4. npm source 能被 installPack 正常安装。
5. pack validate 能发现缺失 module/template/block/file/directory。
6. pack validate 能发现重复 install id。
7. pack build 能输出完整 pack 目录。
8. pack build 能生成 airules.build.json。
9. registry publish 能创建 registry.json。
10. registry publish 能更新已有 pack entry。
11. CLI pack validate/build 可用。
12. CLI registry publish 可用。
```

---

# 建议提交信息

```txt
feat: add phase6 npm source and pack publishing workflow
```

Phase 6 做完后，`airules` 的分发链路就完整了：

```txt
本地 pack
GitHub pack
npm pack
registry alias
pack validate
pack build
registry publish
```

下一阶段建议做 **Phase 7：pack scaffold / create-airules / templates**，也就是：

```bash
airules create pack react-shadcn
airules create registry
airules create skill shadcn-page
```
