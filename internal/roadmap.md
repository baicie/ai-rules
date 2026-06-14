可以，最终我建议你把它设计成一个 **AI Rules Pack Manager**：

> **ai-rules 负责维护规则包；airules CLI 负责把模块、block、skill 安装到目标仓库；`.agents/agent` 负责保存配置、锁文件、缓存和安装状态。**

它的定位类似：

```txt
shadcn/ui registry + AGENTS.md + Agent Skill + dotfiles manager
```

AGENTS.md 本身更像“给 agent 看的 README”，Codex 会读取它作为项目级指导；但 AGENTS.md 内部没有统一标准 include 机制，所以我们不要依赖运行时 include，而是由 CLI 在安装阶段完成拼接、插入和展开。([OpenAI 开发者][1])
Skill 则更适合描述“遇到某类任务时如何工作”，标准形态通常是一个包含 `SKILL.md` 的目录，可带 scripts、references、examples、assets 等资源。([Agent Skills][2])
shadcn 官方也已经把 Skill 和 Registry 用在 AI 场景里：Skill 让 AI 知道如何查找、安装、组合和定制组件，Registry 则用于分发组件、规则和工作流。([Shadcn][3])

---

# 最终方案：airules

## 1. 项目目标

```txt
ai-rules
  规则源仓库，维护所有可复用 AI 规则包。

airules CLI
  安装、更新、移除、检查规则包。

.agents/agent
  当前项目中的 airules 本地状态目录。
```

最终使用体验：

```bash
pnpm dlx @baicie/airules init

pnpm dlx @baicie/airules add github:baicie/ai-rules/packs/react-shadcn \
  --agent codex,cursor,copilot \
  --profile strict
```

生成结果：

```txt
AGENTS.md
CLAUDE.md
.cursor/rules/*.mdc
.github/copilot-instructions.md
.agents/skills/*
docs/ai/*
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
```

---

# 2. 核心设计原则

## 第一，配置和 lock 都放 `.agents/agent`

你提的这个点我完全赞同。

不要污染项目根目录太多文件，统一放：

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   ├── staged/
│   └── state.json
└── skills/
    └── airules/
        └── SKILL.md
```

其中：

```txt
.agents/agent/airules.config.ts
  用户配置，声明安装哪些规则包。

.agents/agent/airules.lock.json
  锁文件，记录来源、版本、commit、hash、已写入文件。

.agents/agent/cache
  缓存远程 pack。

.agents/agent/staged
  冲突时暂存生成结果。

.agents/agent/state.json
  本地状态，例如上次 doctor 结果、安装时间等。
```

---

# 3. Monorepo 结构

建议仓库名：

```txt
ai-rules
```

CLI 包名：

```txt
@baicie/airules
```

Monorepo：

```txt
ai-rules/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
│
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── bin.ts
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── add.ts
│   │   │   │   ├── update.ts
│   │   │   │   ├── remove.ts
│   │   │   │   ├── list.ts
│   │   │   │   ├── doctor.ts
│   │   │   │   └── diff.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── core/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── resolver/
│   │   │   ├── pack/
│   │   │   ├── installer/
│   │   │   ├── merger/
│   │   │   ├── template/
│   │   │   ├── lockfile/
│   │   │   ├── adapters/
│   │   │   └── security/
│   │   └── package.json
│   │
│   └── schema/
│       ├── src/
│       │   ├── config.ts
│       │   ├── pack.ts
│       │   ├── lockfile.ts
│       │   └── index.ts
│       └── package.json
│
├── packs/
│   ├── react-shadcn/
│   ├── ts-monorepo/
│   ├── vue-admin/
│   ├── java-spring/
│   └── aiops/
│
├── skills/
│   └── airules/
│       └── SKILL.md
│
├── docs/
│   ├── spec.md
│   ├── config.md
│   ├── pack.md
│   ├── module.md
│   ├── block.md
│   ├── merge.md
│   ├── security.md
│   └── cli.md
│
└── examples/
    ├── next-shadcn/
    ├── vite-react/
    └── monorepo-app/
```

---

# 4. Pack 内部结构

一个规则包可以同时支持：

```txt
Module 拼接模式
Block 生成模式
Direct File 安装模式
Skill 安装模式
Reference 文档安装模式
```

示例：

```txt
packs/react-shadcn/
├── airules.pack.json
│
├── modules/
│   ├── 001-core.md
│   ├── 010-react.md
│   ├── 020-shadcn.md
│   ├── 030-testing.md
│   └── 040-review.md
│
├── blocks/
│   ├── core.md
│   ├── frontend.md
│   ├── shadcn.md
│   ├── testing.md
│   └── review.md
│
├── templates/
│   ├── AGENTS.md.hbs
│   ├── CLAUDE.md.hbs
│   ├── cursor.mdc.hbs
│   └── copilot-instructions.md.hbs
│
├── files/
│   ├── docs/
│   │   └── ai/
│   │       └── shadcn-usage.md
│   └── .cursor/
│       └── rules/
│           └── shadcn.mdc
│
├── skills/
│   └── shadcn-page/
│       └── SKILL.md
│
└── references/
    ├── form-patterns.md
    ├── table-patterns.md
    └── component-examples.md
```

---

# 5. 三种安装模式

## A. Module 拼接模式

这是你最想要的模式。

每个 module 是一段最终 markdown，CLI 直接按顺序拼接，然后插入现有 `AGENTS.md` 的某个位置。

```json
{
  "id": "codex-agents",
  "agent": "codex",
  "target": "AGENTS.md",
  "mode": "modules",
  "placement": {
    "type": "after-heading",
    "heading": "## AI Rules",
    "fallback": "append"
  },
  "concat": ["core", "react", "shadcn", "testing", "review"]
}
```

适合：

```txt
项目规范
编码规范
shadcn 使用规范
测试规范
review 规范
```

生成：

```md
<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" -->

## Core Rules

...

## React Rules

...

## shadcn/ui Rules

...

## Testing Rules

...

## Review Rules

...

<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->
```

---

## B. Block 模板模式

这个也保留，用来给新 agent 或新工具生成不同格式。

```json
{
  "id": "codex-generated",
  "agent": "codex",
  "target": "AGENTS.md",
  "mode": "template",
  "template": "templates/AGENTS.md.hbs",
  "placement": {
    "type": "append"
  },
  "blocks": ["core", "frontend", "shadcn", "testing"]
}
```

模板：

```md
# Project Agent Rules

{{block "core"}}

{{block "frontend"}}

{{block "shadcn"}}

{{#if requireTests}}
{{block "testing"}}
{{/if}}
```

适合：

```txt
不同 agent 文件格式差异较大
需要变量替换
需要条件生成
未来新增 agent 适配器
```

---

## C. Direct File 模式

直接把某个文件复制到目标位置。

```json
{
  "id": "cursor-shadcn",
  "agent": "cursor",
  "target": ".cursor/rules/shadcn.mdc",
  "mode": "file",
  "from": "files/.cursor/rules/shadcn.mdc",
  "merge": "overwrite-managed"
}
```

适合：

```txt
.cursor/rules/*.mdc
.github/copilot-instructions.md
docs/ai/*.md
某些固定模板文件
```

---

# 6. Pack 配置规范

## `airules.pack.json`

```json
{
  "$schema": "https://baicie.github.io/airules/schema/pack.schema.json",
  "name": "@baicie/react-shadcn",
  "version": "0.1.0",
  "description": "React + shadcn/ui AI coding rules",
  "license": "MIT",
  "keywords": ["react", "shadcn", "tailwind", "frontend"],

  "engines": {
    "airules": ">=0.1.0"
  },

  "profiles": {
    "default": {
      "description": "Default React shadcn rules",
      "installs": [
        "codex-agents",
        "claude-main",
        "cursor-shadcn",
        "copilot-main",
        "skill-shadcn-page",
        "docs-shadcn"
      ],
      "variables": {
        "packageManager": "pnpm",
        "uiAlias": "@/components/ui",
        "bizAlias": "@/components/biz",
        "blocksAlias": "@/components/blocks",
        "requireTests": true,
        "allowAny": false
      }
    },
    "strict": {
      "extends": "default",
      "variables": {
        "requireTests": true,
        "allowAny": false,
        "requireA11y": true
      }
    },
    "minimal": {
      "description": "Only install core and shadcn rules",
      "installs": ["codex-agents-minimal", "cursor-shadcn"]
    }
  },

  "modules": {
    "core": "modules/001-core.md",
    "react": "modules/010-react.md",
    "shadcn": "modules/020-shadcn.md",
    "testing": "modules/030-testing.md",
    "review": "modules/040-review.md"
  },

  "blocks": {
    "core": "blocks/core.md",
    "frontend": "blocks/frontend.md",
    "shadcn": "blocks/shadcn.md",
    "testing": "blocks/testing.md",
    "review": "blocks/review.md"
  },

  "installs": [
    {
      "id": "codex-agents",
      "agent": "codex",
      "target": "AGENTS.md",
      "mode": "modules",
      "placement": {
        "type": "after-heading",
        "heading": "## AI Rules",
        "fallback": "append"
      },
      "concat": ["core", "react", "shadcn", "testing", "review"],
      "merge": "managed-block"
    },
    {
      "id": "codex-agents-minimal",
      "agent": "codex",
      "target": "AGENTS.md",
      "mode": "modules",
      "placement": {
        "type": "append"
      },
      "concat": ["core", "shadcn"],
      "merge": "managed-block"
    },
    {
      "id": "claude-main",
      "agent": "claude",
      "target": "CLAUDE.md",
      "mode": "modules",
      "placement": {
        "type": "append"
      },
      "concat": ["core", "react", "shadcn", "review"],
      "merge": "managed-block"
    },
    {
      "id": "cursor-shadcn",
      "agent": "cursor",
      "target": ".cursor/rules/shadcn.mdc",
      "mode": "template",
      "template": "templates/cursor.mdc.hbs",
      "blocks": ["shadcn"],
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
      "id": "docs-shadcn",
      "agent": "generic",
      "target": "docs/ai/shadcn-usage.md",
      "mode": "file",
      "from": "files/docs/ai/shadcn-usage.md",
      "merge": "overwrite-managed"
    },
    {
      "id": "skill-shadcn-page",
      "agent": "skill",
      "target": ".agents/skills/shadcn-page",
      "mode": "directory",
      "from": "skills/shadcn-page",
      "merge": "overwrite-managed"
    }
  ],

  "detect": {
    "files": ["components.json", "tailwind.config.*", "src/**/*.{ts,tsx}"],
    "packageJson": {
      "dependencies": ["react", "tailwindcss"]
    }
  }
}
```

---

# 7. 项目侧配置：支持 JSON / JS / TS

你提的第二点也应该支持。

搜索优先级：

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.config.mts
.agents/agent/airules.config.cts
.agents/agent/airules.config.js
.agents/agent/airules.config.mjs
.agents/agent/airules.config.cjs
.agents/agent/airules.config.json
```

## 推荐默认：`airules.config.ts`

```ts
import { defineAirulesConfig } from '@baicie/airules'

export default defineAirulesConfig({
  version: 1,

  packs: [
    {
      name: '@baicie/react-shadcn',
      source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      profile: 'strict',
      agents: ['codex', 'cursor', 'copilot'],
      variables: {
        packageManager: 'pnpm',
        uiAlias: '@/components/ui',
        bizAlias: '@/components/biz',
        blocksAlias: '@/components/blocks',
        requireTests: true,
        allowAny: false,
      },
    },
  ],

  install: {
    defaultPlacement: {
      type: 'append',
    },
    conflict: 'warn',
  },

  security: {
    trustedSources: ['github:baicie/ai-rules', 'npm:@baicie/*'],
    allowScripts: false,
    requirePinnedVersion: false,
  },
})
```

## JSON 方式

```json
{
  "$schema": "https://baicie.github.io/airules/schema/config.schema.json",
  "version": 1,
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "profile": "strict",
      "agents": ["codex", "cursor", "copilot"],
      "variables": {
        "packageManager": "pnpm",
        "uiAlias": "@/components/ui",
        "bizAlias": "@/components/biz"
      }
    }
  ],
  "install": {
    "conflict": "warn"
  },
  "security": {
    "allowScripts": false
  }
}
```

---

# 8. Lock 文件

路径固定：

```txt
.agents/agent/airules.lock.json
```

示例：

```json
{
  "lockfileVersion": 1,
  "generatedAt": "2026-06-14T00:00:00.000Z",
  "airulesVersion": "0.1.0",

  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "version": "0.1.0",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "resolved": {
        "type": "github",
        "owner": "baicie",
        "repo": "ai-rules",
        "path": "packs/react-shadcn",
        "ref": "v0.1.0",
        "commit": "abc123"
      },
      "profile": "strict",
      "agents": ["codex", "cursor", "copilot"],
      "hash": "sha256-packhash"
    }
  ],

  "installs": [
    {
      "pack": "@baicie/react-shadcn",
      "installId": "codex-agents",
      "agent": "codex",
      "target": "AGENTS.md",
      "mode": "modules",
      "merge": "managed-block",
      "modules": ["core", "react", "shadcn", "testing", "review"],
      "contentHash": "sha256-contenthash",
      "managedBlockId": "airules:@baicie/react-shadcn:codex-agents"
    },
    {
      "pack": "@baicie/react-shadcn",
      "installId": "cursor-shadcn",
      "agent": "cursor",
      "target": ".cursor/rules/shadcn.mdc",
      "mode": "template",
      "merge": "overwrite-managed",
      "contentHash": "sha256-contenthash"
    }
  ]
}
```

---

# 9. Placement 插入位置规范

支持这些就够用了：

```ts
type Placement =
  | { type: 'append' }
  | { type: 'prepend' }
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
  | { type: 'replace-file' }
```

MVP 优先实现：

```txt
append
prepend
after-heading
replace-file
```

---

# 10. Merge 策略

## `managed-block`

适合 `AGENTS.md` / `CLAUDE.md` / Copilot。

```md
<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" hash="sha256-xxx" -->

...

<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->
```

更新时只替换这一段。

## `overwrite-managed`

适合 `.cursor/rules/*.mdc` / `docs/ai/*.md`。

文件头：

```md
<!-- airules:managed pack="@baicie/react-shadcn" install="cursor-shadcn" version="0.1.0" hash="sha256-xxx" -->
```

只有文件带这个标记时才整体覆盖。

## `skip-if-exists`

适合不想覆盖用户文件。

## `manual`

只生成到：

```txt
.agents/agent/staged/
```

让用户自己合并。

---

# 11. CLI 命令

## 初始化

```bash
airules init
```

生成：

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
.agents/skills/airules/SKILL.md
```

## 安装

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

指定 agent：

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --agent codex,cursor,copilot
```

指定 profile：

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --profile strict
```

## 更新

```bash
airules update
```

只更新一个包：

```bash
airules update @baicie/react-shadcn
```

## 移除

```bash
airules remove @baicie/react-shadcn
```

## 检查

```bash
airules doctor
```

检查：

```txt
配置文件是否存在
lock 是否一致
目标文件 managed block 是否被用户改过
AGENTS.md 是否存在
Cursor Rules 是否存在
Skill 是否安装
引用的 modules / blocks 是否存在
source 是否可信
远程 pack 是否锁定 commit/tag
```

## 预览

```bash
airules diff
airules add ./packs/react-shadcn --dry-run
```

---

# 12. Source 规范

MVP 支持：

```txt
local
github
npm
```

示例：

```bash
airules add ./packs/react-shadcn

airules add github:baicie/ai-rules/packs/react-shadcn#main

airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0

airules add npm:@baicie/airules-react-shadcn
```

解析规则：

```txt
github:owner/repo/path#ref
```

例如：

```txt
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

等价于：

```txt
owner = baicie
repo = ai-rules
path = packs/react-shadcn
ref = v0.1.0
```

---

# 13. TypeScript 类型草案

```ts
export type AgentName =
  | 'codex'
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'generic'
  | 'skill'

export type InstallMode = 'modules' | 'template' | 'file' | 'directory'

export type MergeStrategy =
  | 'managed-block'
  | 'overwrite-managed'
  | 'skip-if-exists'
  | 'manual'

export type Placement =
  | { type: 'append' }
  | { type: 'prepend' }
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
  | { type: 'replace-file' }

export type AirulesPack = {
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
```

---

# 14. 安装算法

```txt
1. 读取 .agents/agent/airules.config.*
2. 解析用户指定 pack source
3. 下载或读取 pack
4. 校验 airules.pack.json
5. 合并 profile 变量
6. 根据 --agent 过滤 installs
7. 对每个 install 执行：
   - modules 模式：读取 concat 中的模块并拼接
   - template 模式：读取 template 并注入 block / variable
   - file 模式：读取 from 文件
   - directory 模式：复制目录
8. 根据 placement 找到插入位置
9. 根据 merge 策略写入目标文件
10. 写入 .agents/agent/airules.lock.json
11. 输出 summary 和验证命令
```

---

# 15. 安全策略

默认规则：

```txt
1. 默认不执行 pack 内脚本。
2. 默认更新只改 managed block。
3. 远程 source 建议 pin 到 tag 或 commit。
4. 安装前支持 --dry-run。
5. lockfile 记录 commit、hash、target、contentHash。
6. 非 trusted source 给 warning。
7. 发生冲突时写入 .agents/agent/staged，而不是强行覆盖。
```

这是必要的，因为 Skill / agent 规则本质上是会影响智能体行为的供应链文本。近期也已经有研究关注 SKILL.md / 技能注册表的语义供应链风险，所以你的 CLI 最好从第一版就带 trusted source、hash、dry-run、managed block。([arXiv][4])

---

# 16. 生成后的目标仓库示例

```txt
your-project/
├── AGENTS.md
├── CLAUDE.md
├── .cursor/
│   └── rules/
│       └── shadcn.mdc
├── .github/
│   └── copilot-instructions.md
├── docs/
│   └── ai/
│       └── shadcn-usage.md
└── .agents/
    ├── agent/
    │   ├── airules.config.ts
    │   ├── airules.lock.json
    │   ├── cache/
    │   ├── staged/
    │   └── state.json
    └── skills/
        ├── airules/
        │   └── SKILL.md
        └── shadcn-page/
            └── SKILL.md
```

---

# 17. 一份最终 Skill：指导智能体使用 airules

路径：

```txt
skills/airules/SKILL.md
```

内容：

````md
---
name: airules
description: Use this skill when managing, installing, updating, reviewing, or authoring AI rule packs for a repository with airules. This includes AGENTS.md, CLAUDE.md, Cursor rules, Copilot instructions, agent skills, and reusable AI coding rules.
---

# airules Skill

## Purpose

Use this skill to manage AI coding rules through the airules system.

airules is a rule pack manager for coding agents. It installs reusable rule modules, generated blocks, direct files, and skills into a target repository. Local configuration and lock state live under `.agents/agent`.

## When to use

Use this skill when the user asks to:

- Create or update AI coding rules.
- Install rules into AGENTS.md, CLAUDE.md, Cursor Rules, or Copilot Instructions.
- Reuse agent rules across repositories.
- Add shadcn/ui, React, Vue, TypeScript, Java, AIOps, or monorepo coding rules.
- Design or modify an airules pack.
- Debug airules installation or lockfile issues.
- Review whether a repository has correct AI rules.

## Core directories

In the target repository:

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

Important files:

- `.agents/agent/airules.config.ts`: primary configuration.
- `.agents/agent/airules.lock.json`: lockfile recording installed packs and generated content hashes.
- `.agents/agent/staged`: conflict output or manually staged generated files.
- `.agents/skills`: installed agent skills.

## Config lookup order

When reading an airules project, look for config files in this order:

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.config.mts
.agents/agent/airules.config.cts
.agents/agent/airules.config.js
.agents/agent/airules.config.mjs
.agents/agent/airules.config.cjs
.agents/agent/airules.config.json
```

Prefer TypeScript config when creating a new project.

## Pack concepts

An airules pack may contain four install modes:

1. `modules`

   - Concatenate markdown modules in order.
   - Insert into an existing target file.
   - Best for AGENTS.md and CLAUDE.md.

2. `template`

   - Render a template with blocks and variables.
   - Best for adapting the same rule content to a new agent format.

3. `file`

   - Copy one source file to one target file.
   - Best for Cursor rules, Copilot instructions, and docs.

4. `directory`

   - Copy a source directory to a target directory.
   - Best for installing skills.

## Preferred design

When creating a new pack, prefer this structure:

```txt
packs/<pack-name>/
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
├── skills/
└── references/
```

Use modules for stable final markdown.
Use blocks for reusable generated content.
Use templates for new agent adapters.
Use files for direct copies.
Use skills for task-specific workflows.

## Do not rely on markdown include

Do not assume AGENTS.md supports runtime include syntax such as:

```md
@include ./docs/ai/rules.md
{{include:rules.md}}
```

Instead, use airules to physically generate or insert the final content into the target file.

## Managed block format

When installing into an existing markdown file, use managed blocks:

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

If `after-heading` or `before-heading` cannot find the heading, use the configured fallback. If no fallback exists, report the issue.

## Merge rules

Supported merge strategies:

- `managed-block`

  - Replace only the managed block.
  - Use for AGENTS.md, CLAUDE.md, and Copilot instructions.

- `overwrite-managed`

  - Overwrite the full file only if it is already airules-managed.
  - Use for Cursor rule files and generated docs.

- `skip-if-exists`

  - Do not overwrite existing files.

- `manual`

  - Write generated output to `.agents/agent/staged`.

## Commands

Use these commands when available:

```bash
airules init
airules add <source>
airules update
airules remove <pack-name>
airules list
airules doctor
airules diff
```

For examples:

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0 --profile strict --agent codex,cursor
airules update
airules doctor
```

## Safety rules

Before installing or updating remote packs:

1. Prefer pinned tag or commit sources.
2. Do not run remote scripts by default.
3. Prefer `--dry-run` when the change is large.
4. Preserve user-authored content outside managed blocks.
5. Check `.agents/agent/airules.lock.json` after installation.
6. If generated content conflicts with user edits, write to `.agents/agent/staged` and explain the conflict.

## How to create a React shadcn pack

Create:

```txt
packs/react-shadcn/
├── airules.pack.json
├── modules/
│   ├── 001-core.md
│   ├── 010-react.md
│   ├── 020-shadcn.md
│   ├── 030-testing.md
│   └── 040-review.md
├── blocks/
├── templates/
├── files/
└── skills/
```

The pack should install:

- AGENTS.md for Codex.
- CLAUDE.md for Claude.
- `.cursor/rules/shadcn.mdc` for Cursor.
- `.github/copilot-instructions.md` for Copilot.
- `.agents/skills/shadcn-page/SKILL.md` for shadcn page generation.

## Review checklist

When reviewing an airules setup, check:

- Config exists under `.agents/agent`.
- Lockfile exists and matches generated targets.
- AGENTS.md has an airules managed block.
- No duplicate managed blocks exist.
- Cursor / Copilot / Claude files match selected agents.
- Installed skills exist under `.agents/skills`.
- Remote sources are pinned or trusted.
- User content outside managed blocks was not overwritten.

````

---

# 18. MVP 路线

## Phase 0：协议文档

产物：

```txt
docs/spec.md
docs/config.md
docs/pack.md
docs/module.md
docs/block.md
docs/merge.md
docs/security.md
````

## Phase 1：本地 Module 拼接

先实现：

```txt
local source
airules.config.ts/json
airules.pack.json
modules 模式
append / prepend / after-heading
managed-block
lockfile
dry-run
```

命令：

```bash
airules init
airules add ./packs/react-shadcn --agent codex
airules update
airules doctor
```

## Phase 2：GitHub source

支持：

```txt
github:owner/repo/path#ref
cache
commit/hash lock
trusted source warning
```

## Phase 3：Block + Template

支持：

```txt
blocks
templates
variables
conditions
Cursor/Copilot/Claude adapter
```

## Phase 4：Skill 安装

支持：

```txt
directory mode
.agents/skills/*
pack 内置 skill
airules 自身 skill
```

## Phase 5：Registry

支持：

```txt
airules search
airules add @baicie/react-shadcn
registry.json
私有规则索引
```

---

# 最终一句话

你的最终方案可以定义为：

> **airules 是一套面向 Coding Agent 的规则包协议和 CLI。它以 `.agents/agent` 为本地配置与锁文件目录，支持 JSON/JS/TS 配置，支持 Markdown Module 拼接、Block 模板生成、Direct File 安装和 Skill 分发，并通过 managed block 安全地把规则插入 AGENTS.md、CLAUDE.md、Cursor Rules、Copilot Instructions 等 agent 入口。**

我建议第一版不要贪大，直接做：

```txt
.agents/agent 配置与 lock
modules 拼接
managed-block 插入
local/github source
codex/cursor/copilot/claude 四个 agent
airules Skill 自动安装
```

这版做完，你自己的 `zeus`、`zeus-ui`、`sql-studio`、`aiops`、`tools` 都可以统一复用规则了。

[1]: https://developers.openai.com/codex/guides/agents-md?utm_source=chatgpt.com 'Custom instructions with AGENTS.md – Codex'
[2]: https://agentskills.io/home?utm_source=chatgpt.com 'Agent Skills Overview - Agent Skills'
[3]: https://ui.shadcn.com/docs/skills?utm_source=chatgpt.com 'Skills - shadcn/ui'
[4]: https://arxiv.org/abs/2605.11418?utm_source=chatgpt.com 'Under the Hood of SKILL.md: Semantic Supply-chain Attacks on AI Agent Skill Registry'
