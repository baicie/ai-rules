我看了一下 `baicie/ai-rules` 当前仓库状态：基本是空仓库，`README.md` 也不存在。所以这里给的是 **从空仓库开始的 Phase 0 完整落地方案**。

Phase 0 不做真正的远程安装逻辑，先把 **协议、类型、Schema、配置加载、Profile 解析、managed block 基础能力、CLI 骨架、单元测试** 建好。

---

# Phase 0 目标

## 目标范围

Phase 0 只做基础设施：

```txt
1. 初始化 pnpm monorepo
2. 定义 airules Pack / Config / Lockfile 类型
3. 用 zod 做 schema 校验
4. 支持 .agents/agent/airules.config.{ts,js,json}
5. 实现 profile extends / variables 合并
6. 实现 managed block 生成、替换、插入
7. 实现 airules init / doctor / list 骨架命令
8. 补完整单元测试
```

## 不做的内容

这些放到 Phase 1+：

```txt
1. 不实现 github source 下载
2. 不实现 add/update 真正安装 pack
3. 不实现 template/block 渲染
4. 不实现 directory mode 安装 skill
5. 不实现 registry search
```

---

# 最终目录结构

```txt
ai-rules/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.base.json
├── vitest.config.ts
├── .gitignore
├── README.md
│
├── docs/
│   └── phase0.md
│
├── packages/
│   ├── schema/
│   │   ├── package.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── define.ts
│   │       ├── index.ts
│   │       ├── schema.test.ts
│   │       ├── schema.ts
│   │       └── types.ts
│   │
│   ├── core/
│   │   ├── package.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── config-loader.test.ts
│   │       ├── config-loader.ts
│   │       ├── constants.ts
│   │       ├── hash.ts
│   │       ├── index.ts
│   │       ├── managed-block.test.ts
│   │       ├── managed-block.ts
│   │       ├── profile.test.ts
│   │       └── profile.ts
│   │
│   └── cli/
│       ├── package.json
│       ├── tsup.config.ts
│       └── src/
│           ├── bin.ts
│           ├── commands/
│           │   ├── doctor.ts
│           │   ├── init.ts
│           │   └── list.ts
│           └── index.ts
│
└── skills/
    └── airules/
        └── SKILL.md
```

---

# 代码

## `package.json`

```json
{
  "name": "ai-rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check": "pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@types/node": "^22.15.30",
    "tsup": "^8.3.5",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
```

---

## `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

---

## `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

---

## `tsconfig.json`

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/**/*.ts", "vitest.config.ts"]
}
```

---

## `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
```

---

## `.gitignore`

```gitignore
node_modules
dist
coverage
.turbo
.DS_Store
.agents/agent/cache
.agents/agent/staged
```

---

## `README.md`

````md
# ai-rules

Reusable AI coding rule packs and the `airules` CLI.

## Goals

`airules` is a rule pack manager for coding agents. It installs reusable rule modules, generated blocks, direct files, and skills into a target repository.

Local configuration and lock state live under:

```txt
.agents/agent
```
````

## Phase 0

Phase 0 provides:

- Pack / Config / Lockfile schema.
- TypeScript definitions.
- Config loading from `.agents/agent`.
- Profile resolution.
- Managed block helpers.
- CLI skeleton.

## Commands

```bash
pnpm install
pnpm check
```

````

---

# docs

## `docs/phase0.md`

```md
# Phase 0 Design

## Scope

Phase 0 establishes the protocol and minimal implementation foundation for `airules`.

It does not install remote packs yet. It only defines and validates the core model.

## Local state directory

All airules-local files live under:

```txt
.agents/agent
````

Important files:

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
.agents/agent/cache
.agents/agent/staged
.agents/agent/state.json
```

## Config lookup order

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.config.mts
.agents/agent/airules.config.cts
.agents/agent/airules.config.js
.agents/agent/airules.config.mjs
.agents/agent/airules.config.cjs
.agents/agent/airules.config.json
```

## Pack install modes

### modules

Concatenate markdown modules in order.

### template

Render a template using blocks and variables.

### file

Copy a single file.

### directory

Copy a directory.

## Merge strategies

### managed-block

Only replace an airules-managed block inside a target markdown file.

### overwrite-managed

Overwrite a full target file only if the file is already marked as airules-managed.

### skip-if-exists

Do not overwrite an existing target.

### manual

Write generated output to `.agents/agent/staged`.

## Phase 0 deliverables

- `@baicie/airules-schema`
- `@baicie/airules-core`
- `@baicie/airules`
- Unit tests for schema, profile, config lookup, and managed blocks.

````

---

# packages/schema

## `packages/schema/package.json`

```json
{
  "name": "@baicie/airules-schema",
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
    "zod": "^3.25.56"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
````

---

## `packages/schema/tsup.config.ts`

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

---

## `packages/schema/src/types.ts`

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

export type AirulesProfile = {
  description?: string
  extends?: string
  installs?: string[]
  variables?: Record<string, unknown>
}

export type AirulesInstall = {
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

export type AirulesPack = {
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

export type AirulesConfigPack = {
  name?: string
  source: string
  profile?: string
  agents?: AgentName[]
  variables?: Record<string, unknown>
}

export type AirulesConfig = {
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

export type AirulesLockPack = {
  name: string
  version: string
  source: string
  resolved: AirulesResolvedSource
  profile?: string
  agents?: AgentName[]
  hash: string
}

export type AirulesLockInstall = {
  pack: string
  installId: string
  agent: AgentName
  target: string
  mode: InstallMode
  merge?: MergeStrategy
  modules?: string[]
  blocks?: string[]
  contentHash: string
  managedBlockId?: string
}

export type AirulesLockfile = {
  lockfileVersion: 1
  generatedAt: string
  airulesVersion: string
  packs: AirulesLockPack[]
  installs: AirulesLockInstall[]
}
```

---

## `packages/schema/src/schema.ts`

```ts
import { z } from 'zod'

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

export const AirulesLockInstallSchema = z.object({
  pack: z.string().min(1),
  installId: z.string().min(1),
  agent: AgentNameSchema,
  target: z.string().min(1),
  mode: InstallModeSchema,
  merge: MergeStrategySchema.optional(),
  modules: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
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

## `packages/schema/src/define.ts`

```ts
import type { AirulesConfig, AirulesPack } from './types'

export function defineAirulesConfig(config: AirulesConfig): AirulesConfig {
  return config
}

export function defineAirulesPack(pack: AirulesPack): AirulesPack {
  return pack
}
```

---

## `packages/schema/src/index.ts`

```ts
export * from './define'
export * from './schema'
export * from './types'
```

---

## `packages/schema/src/schema.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  AirulesConfigSchema,
  AirulesPackSchema,
  type AirulesConfig,
  type AirulesPack,
} from './index'

describe('AirulesPackSchema', () => {
  it('parses a modules install pack', () => {
    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {
        core: 'modules/001-core.md',
      },
      installs: [
        {
          id: 'codex-agents',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core'],
          merge: 'managed-block',
          placement: {
            type: 'append',
          },
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).not.toThrow()
  })

  it('rejects modules mode without concat', () => {
    const pack = {
      name: '@baicie/invalid',
      version: '0.1.0',
      installs: [
        {
          id: 'codex-agents',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).toThrow(
      /modules mode requires non-empty concat/,
    )
  })

  it('rejects template mode without template', () => {
    const pack = {
      name: '@baicie/invalid',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/rule.mdc',
          mode: 'template',
          blocks: ['core'],
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).toThrow(
      /template mode requires template/,
    )
  })
})

describe('AirulesConfigSchema', () => {
  it('parses config', () => {
    const config: AirulesConfig = {
      version: 1,
      packs: [
        {
          source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
          profile: 'strict',
          agents: ['codex', 'cursor'],
          variables: {
            packageManager: 'pnpm',
          },
        },
      ],
      security: {
        allowScripts: false,
      },
    }

    expect(AirulesConfigSchema.parse(config)).toEqual(config)
  })
})
```

---

# packages/core

## `packages/core/package.json`

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
    "jiti": "^2.4.2"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
```

---

## `packages/core/tsup.config.ts`

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@baicie/airules-schema'],
})
```

---

## `packages/core/src/constants.ts`

```ts
export const AIRULES_AGENT_DIR = '.agents/agent'

export const AIRULES_CONFIG_FILENAMES = [
  'airules.config.ts',
  'airules.config.mts',
  'airules.config.cts',
  'airules.config.js',
  'airules.config.mjs',
  'airules.config.cjs',
  'airules.config.json',
] as const

export const AIRULES_LOCK_FILENAME = 'airules.lock.json'

export const AIRULES_CACHE_DIRNAME = 'cache'

export const AIRULES_STAGED_DIRNAME = 'staged'

export const AIRULES_STATE_FILENAME = 'state.json'
```

---

## `packages/core/src/hash.ts`

```ts
import { createHash } from 'node:crypto'

export function sha256(content: string): string {
  const hash = createHash('sha256').update(content).digest('hex')
  return `sha256-${hash}`
}
```

---

## `packages/core/src/config-loader.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'
import { AirulesConfigSchema, type AirulesConfig } from '@baicie/airules-schema'
import {
  AIRULES_AGENT_DIR,
  AIRULES_CONFIG_FILENAMES,
  AIRULES_LOCK_FILENAME,
} from './constants'

export type ResolvedAirulesConfigPath = {
  path: string
  filename: string
}

export function getAirulesAgentDir(cwd = process.cwd()): string {
  return resolve(cwd, AIRULES_AGENT_DIR)
}

export function getAirulesLockPath(cwd = process.cwd()): string {
  return join(getAirulesAgentDir(cwd), AIRULES_LOCK_FILENAME)
}

export function resolveAirulesConfigPath(
  cwd = process.cwd(),
): ResolvedAirulesConfigPath | null {
  const dir = getAirulesAgentDir(cwd)

  for (const filename of AIRULES_CONFIG_FILENAMES) {
    const configPath = join(dir, filename)
    if (existsSync(configPath)) {
      return {
        path: configPath,
        filename,
      }
    }
  }

  return null
}

export async function loadAirulesConfig(
  cwd = process.cwd(),
): Promise<AirulesConfig> {
  const resolvedConfig = resolveAirulesConfigPath(cwd)

  if (!resolvedConfig) {
    throw new Error(
      `Cannot find airules config under ${AIRULES_AGENT_DIR}. Run airules init first.`,
    )
  }

  const rawConfig = await loadConfigFile(resolvedConfig.path)

  return AirulesConfigSchema.parse(rawConfig)
}

async function loadConfigFile(configPath: string): Promise<unknown> {
  if (configPath.endsWith('.json')) {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  }

  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  })

  const loaded = await jiti.import(configPath, {
    default: true,
  })

  return unwrapDefault(loaded)
}

function unwrapDefault(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'default' in value &&
    Object.keys(value).length === 1
  ) {
    return (value as { default: unknown }).default
  }

  return value
}
```

---

## `packages/core/src/profile.ts`

```ts
import type {
  AgentName,
  AirulesInstall,
  AirulesPack,
  AirulesProfile,
} from '@baicie/airules-schema'

export type ResolvedProfile = {
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
      installs: pack.installs.map(install => install.id),
      variables: {},
    }
  }

  if (!profiles[profileName]) {
    throw new Error(`Profile "${profileName}" does not exist in ${pack.name}.`)
  }

  const visited = new Set<string>()

  return resolveProfileInner(profiles, profileName, visited)
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
        installs: undefined,
        variables: {},
      }

  visited.delete(profileName)

  return {
    name: profileName,
    installs: mergeStringList(base.installs, profile.installs),
    variables: {
      ...base.variables,
      ...profile.variables,
    },
  }
}

function mergeStringList(
  base?: string[],
  current?: string[],
): string[] | undefined {
  if (!base && !current) {
    return undefined
  }

  return Array.from(new Set([...(base ?? []), ...(current ?? [])]))
}

export function selectInstalls(
  pack: AirulesPack,
  options?: {
    profile?: string
    agents?: AgentName[]
  },
): AirulesInstall[] {
  const resolvedProfile = resolveProfile(pack, options?.profile ?? 'default')

  const installIdSet = new Set(
    resolvedProfile.installs ?? pack.installs.map(install => install.id),
  )

  const missingInstallIds = [...installIdSet].filter(
    installId => !pack.installs.some(install => install.id === installId),
  )

  if (missingInstallIds.length > 0) {
    throw new Error(
      `Profile references missing install ids: ${missingInstallIds.join(', ')}`,
    )
  }

  const agentSet = options?.agents ? new Set(options.agents) : null

  return pack.installs.filter(install => {
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

## `packages/core/src/managed-block.ts`

```ts
import type { Placement } from '@baicie/airules-schema'
import { sha256 } from './hash'

export type ManagedBlockMeta = {
  pack: string
  install: string
  version: string
  hash?: string
}

export type ManagedBlockRange = {
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

## `packages/core/src/index.ts`

```ts
export * from './config-loader'
export * from './constants'
export * from './hash'
export * from './managed-block'
export * from './profile'
```

---

## `packages/core/src/profile.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { AirulesPack } from '@baicie/airules-schema'
import { resolveProfile, selectInstalls } from './profile'

const pack: AirulesPack = {
  name: '@baicie/react-shadcn',
  version: '0.1.0',
  profiles: {
    default: {
      installs: ['codex', 'cursor'],
      variables: {
        packageManager: 'pnpm',
        requireTests: false,
      },
    },
    strict: {
      extends: 'default',
      installs: ['copilot'],
      variables: {
        requireTests: true,
        allowAny: false,
      },
    },
  },
  installs: [
    {
      id: 'codex',
      agent: 'codex',
      target: 'AGENTS.md',
      mode: 'modules',
      concat: ['core'],
    },
    {
      id: 'cursor',
      agent: 'cursor',
      target: '.cursor/rules/rule.mdc',
      mode: 'file',
      from: 'files/cursor.mdc',
    },
    {
      id: 'copilot',
      agent: 'copilot',
      target: '.github/copilot-instructions.md',
      mode: 'modules',
      concat: ['core'],
    },
  ],
}

describe('resolveProfile', () => {
  it('merges extends installs and variables', () => {
    const profile = resolveProfile(pack, 'strict')

    expect(profile).toEqual({
      name: 'strict',
      installs: ['codex', 'cursor', 'copilot'],
      variables: {
        packageManager: 'pnpm',
        requireTests: true,
        allowAny: false,
      },
    })
  })

  it('throws for missing profile', () => {
    expect(() => resolveProfile(pack, 'missing')).toThrow(
      /Profile "missing" does not exist/,
    )
  })
})

describe('selectInstalls', () => {
  it('selects installs by profile', () => {
    const installs = selectInstalls(pack, {
      profile: 'strict',
    })

    expect(installs.map(install => install.id)).toEqual([
      'codex',
      'cursor',
      'copilot',
    ])
  })

  it('filters installs by agents', () => {
    const installs = selectInstalls(pack, {
      profile: 'strict',
      agents: ['cursor'],
    })

    expect(installs.map(install => install.id)).toEqual(['cursor'])
  })
})
```

---

## `packages/core/src/managed-block.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  createManagedBlock,
  findManagedBlockRange,
  insertByPlacement,
  replaceManagedBlock,
  upsertManagedBlock,
} from './managed-block'

describe('managed block', () => {
  it('creates managed block with hash', () => {
    const block = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Rules\n\n- Use shadcn/ui.\n',
    )

    expect(block).toContain(
      '<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" hash="sha256-',
    )
    expect(block).toContain('## Rules')
    expect(block).toContain(
      '<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->',
    )
  })

  it('finds managed block range', () => {
    const source = [
      '# AGENTS.md',
      '',
      '<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" hash="sha256-xxx" -->',
      '## Rules',
      '<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->',
      '',
      'After',
    ].join('\n')

    const range = findManagedBlockRange(source, {
      pack: '@baicie/react-shadcn',
      install: 'codex-agents',
    })

    expect(range).not.toBeNull()
    expect(source.slice(range!.start, range!.end)).toContain('## Rules')
  })

  it('replaces existing managed block', () => {
    const oldBlock = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      'old',
    )

    const newBlock = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      'new',
    )

    const source = `before\n\n${oldBlock}\n\nafter`
    const next = replaceManagedBlock(
      source,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
      },
      newBlock,
    )

    expect(next).toContain('new')
    expect(next).not.toContain('old')
    expect(next).toContain('before')
    expect(next).toContain('after')
  })

  it('inserts after heading', () => {
    const source = '# AGENTS.md\n\n## AI Rules\n\n## Commands\n'
    const next = insertByPlacement(source, 'INSERTED', {
      type: 'after-heading',
      heading: '## AI Rules',
    })

    expect(next).toContain('## AI Rules\n\nINSERTED\n\n## Commands')
  })

  it('uses fallback append when heading does not exist', () => {
    const source = '# AGENTS.md\n'
    const next = insertByPlacement(source, 'INSERTED', {
      type: 'after-heading',
      heading: '## Missing',
      fallback: 'append',
    })

    expect(next).toBe('# AGENTS.md\n\nINSERTED\n')
  })

  it('upserts managed block', () => {
    const source = '# AGENTS.md\n'
    const next = upsertManagedBlock(
      source,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Rules',
      {
        type: 'append',
      },
    )

    const updated = upsertManagedBlock(
      next,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Updated Rules',
      {
        type: 'append',
      },
    )

    expect(updated).toContain('## Updated Rules')
    expect(updated).not.toContain('## Rules\n<!--')
  })
})
```

---

## `packages/core/src/config-loader.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getAirulesAgentDir,
  getAirulesLockPath,
  loadAirulesConfig,
  resolveAirulesConfigPath,
} from './config-loader'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-'))
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

describe('config-loader', () => {
  it('resolves agent dir and lock path', () => {
    const cwd = '/repo'

    expect(getAirulesAgentDir(cwd)).toBe('/repo/.agents/agent')
    expect(getAirulesLockPath(cwd)).toBe(
      '/repo/.agents/agent/airules.lock.json',
    )
  })

  it('resolves config file by lookup order', () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [],
      }),
    )

    const resolved = resolveAirulesConfigPath(cwd)

    expect(resolved?.filename).toBe('airules.config.json')
  })

  it('loads json config', async () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [
          {
            source: './packs/react-shadcn',
            agents: ['codex'],
          },
        ],
        security: {
          allowScripts: false,
        },
      }),
    )

    const config = await loadAirulesConfig(cwd)

    expect(config.version).toBe(1)
    expect(config.packs[0]?.source).toBe('./packs/react-shadcn')
  })

  it('throws when config does not exist', async () => {
    const cwd = createTempProject()

    await expect(loadAirulesConfig(cwd)).rejects.toThrow(
      /Cannot find airules config/,
    )
  })
})
```

---

# packages/cli

## `packages/cli/package.json`

```json
{
  "name": "@baicie/airules",
  "version": "0.0.0",
  "type": "module",
  "private": false,
  "bin": {
    "airules": "./dist/bin.js"
  },
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
    "@baicie/airules-core": "workspace:*",
    "@baicie/airules-schema": "workspace:*",
    "cac": "^6.7.14"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "typescript": "^5.8.3",
    "vitest": "^3.2.2"
  }
}
```

---

## `packages/cli/tsup.config.ts`

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
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['@baicie/airules-core', '@baicie/airules-schema'],
})
```

---

## `packages/cli/src/index.ts`

```ts
export { runCli } from './bin'
```

---

## `packages/cli/src/bin.ts`

```ts
import { cac } from 'cac'
import { runDoctorCommand } from './commands/doctor'
import { runInitCommand } from './commands/init'
import { runListCommand } from './commands/list'

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

runCli()
```

---

## `packages/cli/src/commands/init.ts`

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

export type InitCommandOptions = {
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

  console.log(`Initialized airules under ${AIRULES_AGENT_DIR}`)
}

function writeFileIfAllowed(
  filePath: string,
  content: string,
  force = false,
): void {
  if (existsSync(filePath) && !force) {
    const existing = readFileSync(filePath, 'utf8')
    if (existing.length > 0) {
      console.log(`Skipped existing file: ${filePath}`)
      return
    }
  }

  writeFileSync(filePath, content)
  console.log(`Created file: ${filePath}`)
}

function createDefaultConfig(): string {
  return `import { defineAirulesConfig } from "@baicie/airules-schema";

export default defineAirulesConfig({
  version: 1,
  packs: [],
  install: {
    conflict: "warn"
  },
  security: {
    trustedSources: [],
    allowScripts: false,
    requirePinnedVersion: false
  }
});
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

## `packages/cli/src/commands/doctor.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import {
  getAirulesLockPath,
  loadAirulesConfig,
  resolveAirulesConfigPath,
} from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export type DoctorCommandOptions = {
  cwd: string
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  const resolvedConfig = resolveAirulesConfigPath(options.cwd)

  if (!resolvedConfig) {
    console.log('airules doctor')
    console.log('✖ Config not found under .agents/agent')
    process.exitCode = 1
    return
  }

  console.log('airules doctor')
  console.log(`✔ Config found: ${resolvedConfig.path}`)

  try {
    await loadAirulesConfig(options.cwd)
    console.log('✔ Config schema valid')
  } catch (error) {
    console.log('✖ Config schema invalid')
    console.log(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const lockPath = getAirulesLockPath(options.cwd)

  if (!existsSync(lockPath)) {
    console.log('⚠ Lockfile not found')
    return
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    AirulesLockfileSchema.parse(lock)
    console.log(`✔ Lockfile valid: ${lockPath}`)
  } catch (error) {
    console.log('✖ Lockfile invalid')
    console.log(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
```

---

## `packages/cli/src/commands/list.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { getAirulesLockPath } from '@baicie/airules-core'
import { AirulesLockfileSchema } from '@baicie/airules-schema'

export type ListCommandOptions = {
  cwd: string
}

export async function runListCommand(
  options: ListCommandOptions,
): Promise<void> {
  const lockPath = getAirulesLockPath(options.cwd)

  if (!existsSync(lockPath)) {
    console.log('No airules lockfile found.')
    return
  }

  const lock = AirulesLockfileSchema.parse(
    JSON.parse(readFileSync(lockPath, 'utf8')),
  )

  if (lock.packs.length === 0) {
    console.log('No airules packs installed.')
    return
  }

  console.log('Installed airules packs:')

  for (const pack of lock.packs) {
    console.log(`- ${pack.name}@${pack.version}`)
    console.log(`  source: ${pack.source}`)
    if (pack.profile) {
      console.log(`  profile: ${pack.profile}`)
    }
    if (pack.agents?.length) {
      console.log(`  agents: ${pack.agents.join(', ')}`)
    }
  }
}
```

---

# Skill

## `skills/airules/SKILL.md`

````md
---
name: airules
description: Use this skill when managing, installing, updating, reviewing, or authoring AI rule packs for a repository with airules.
---

# airules Skill

## Purpose

Use this skill to manage AI coding rules through the airules system.

airules is a rule pack manager for coding agents. It installs reusable rule modules, generated blocks, direct files, and skills into a target repository. Local configuration and lock state live under `.agents/agent`.

## Core directories

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   ├── staged/
│   └── state.json
└── skills/
    └── <skill-name>/
        └── SKILL.md
```
````

## Config lookup order

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.config.mts
.agents/agent/airules.config.cts
.agents/agent/airules.config.js
.agents/agent/airules.config.mjs
.agents/agent/airules.config.cjs
.agents/agent/airules.config.json
```

## Pack concepts

An airules pack may contain four install modes:

1. `modules`

   - Concatenate markdown modules in order.
   - Best for AGENTS.md and CLAUDE.md.

2. `template`

   - Render a template with blocks and variables.
   - Best for adapting content to a new agent format.

3. `file`

   - Copy one source file to one target file.
   - Best for Cursor rules, Copilot instructions, and docs.

4. `directory`

   - Copy a source directory to a target directory.
   - Best for installing skills.

## Managed block format

```md
<!-- airules:start pack="<pack-name>" install="<install-id>" version="<version>" hash="<hash>" -->

...

<!-- airules:end pack="<pack-name>" install="<install-id>" -->
```

Only modify content inside airules managed blocks when updating.

Do not overwrite user-authored content outside managed blocks.

## Placement rules

Supported placement strategies:

- `append`
- `prepend`
- `after-heading`
- `before-heading`
- `replace-file`

## Merge rules

Supported merge strategies:

- `managed-block`
- `overwrite-managed`
- `skip-if-exists`
- `manual`

## Commands

```bash
airules init
airules doctor
airules list
```

Phase 1 will add:

```bash
airules add <source>
airules update
airules remove <pack-name>
airules diff
```

## Safety rules

1. Prefer pinned tag or commit sources.
2. Do not run remote scripts by default.
3. Preserve user-authored content outside managed blocks.
4. Check `.agents/agent/airules.lock.json` after installation.
5. If generated content conflicts with user edits, write to `.agents/agent/staged`.

````

---

# 安装和验证

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
````

或者：

```bash
pnpm check
```

CLI 本地验证：

```bash
pnpm --filter @baicie/airules build
node packages/cli/dist/bin.js init
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js list
```

---

# Phase 0 验收标准

完成后必须满足：

```txt
1. pnpm install 成功
2. pnpm typecheck 成功
3. pnpm test 成功
4. pnpm build 成功
5. airules init 能生成 .agents/agent/airules.config.ts
6. airules init 能生成 .agents/agent/airules.lock.json
7. airules doctor 能校验 config 和 lockfile
8. schema 能拒绝非法 pack
9. profile 能正确 extends
10. managed block 能创建、查找、替换、插入
```

---

# 建议提交信息

```txt
feat: initialize airules phase 0 foundation
```

Phase 1 再开始做：

```txt
airules add ./packs/react-shadcn --agent codex
```

也就是本地 pack 的读取、module 拼接和真实写入。
