import type { AirulesLockfile } from '@baicie/airules-schema'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AIRULES_AGENT_DIR,
  AIRULES_CACHE_DIRNAME,
  AIRULES_LOCK_FILENAME,
  AIRULES_SELF_SKILL_NAME,
  AIRULES_SKILLS_DIR,
  AIRULES_STAGED_DIRNAME,
} from './constants'
import { createEmptyLockfile } from './lockfile'

export interface EnsureAirulesProjectOptions {
  cwd: string
  force?: boolean
  writeConfig?: boolean
  writeLockfile?: boolean
  writeSelfSkill?: boolean
}

export interface EnsureAirulesProjectResult {
  created: string[]
  skipped: string[]
}

export function ensureAirulesProject(
  options: EnsureAirulesProjectOptions,
): EnsureAirulesProjectResult {
  const created: string[] = []
  const skipped: string[] = []
  const force = options.force === true

  const agentDir = join(options.cwd, AIRULES_AGENT_DIR)
  const cacheDir = join(agentDir, AIRULES_CACHE_DIRNAME)
  const stagedDir = join(agentDir, AIRULES_STAGED_DIRNAME)
  const selfSkillDir = join(
    options.cwd,
    AIRULES_SKILLS_DIR,
    AIRULES_SELF_SKILL_NAME,
  )

  mkdirSync(agentDir, {
    recursive: true,
  })
  mkdirSync(cacheDir, {
    recursive: true,
  })
  mkdirSync(stagedDir, {
    recursive: true,
  })
  mkdirSync(selfSkillDir, {
    recursive: true,
  })

  if (options.writeConfig !== false) {
    writeFileIfAllowed({
      filePath: join(agentDir, 'airules.config.ts'),
      content: createCompactDefaultConfigContent(),
      force,
      created,
      skipped,
    })
  }

  if (options.writeLockfile !== false) {
    writeFileIfAllowed({
      filePath: join(agentDir, AIRULES_LOCK_FILENAME),
      content: renderLockfile(createEmptyLockfile()),
      force,
      created,
      skipped,
    })
  }

  if (options.writeSelfSkill !== false) {
    writeFileIfAllowed({
      filePath: join(selfSkillDir, 'SKILL.md'),
      content: createAirulesSelfSkillContent(),
      force,
      created,
      skipped,
    })
  }

  return {
    created,
    skipped,
  }
}

export function createCompactDefaultConfigContent(): string {
  return `export default {
  packs: [],
}
`
}

export function createAirulesSelfSkillContent(): string {
  return `---
name: airules
description: Use this skill when managing AI rule packs, AGENTS.md, Cursor rules, Copilot instructions, Claude instructions, and .agents/agent state with airules.
---

# airules Skill

## Purpose

Use this skill to maintain AI coding rules through airules.

airules installs reusable rule packs and AgentMD snippets into a repository. Local state is stored under \`.agents/agent\`.

## Core files

\`\`\`txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   └── staged/
└── skills/
    └── airules/
        └── SKILL.md
\`\`\`

## Rules

- Prefer editing \`.agents/agent/airules.config.ts\` through airules commands.
- Do not manually edit \`.agents/agent/airules.lock.json\` unless repairing state.
- Preserve user content outside airules managed blocks.
- Use \`airules doctor\` after modifying installed rules.
- Use \`airules diff\` before large updates.
- Use \`airules remove <pack>\` instead of deleting generated files manually.
- Use registry aliases for public packs and pinned sources for reproducible installs.

## Common commands

\`\`\`bash
airules add <source>
airules update
airules diff
airules doctor
airules remove <pack>
airules search <query>
airules registry list
airules pack validate <pack>
\`\`\`

## Review checklist

When reviewing an airules repository:

1. Check \`.agents/agent/airules.config.ts\`.
2. Check \`.agents/agent/airules.lock.json\`.
3. Check generated targets such as \`AGENTS.md\`, \`.cursor/rules/*.mdc\`, \`.github/copilot-instructions.md\`, and \`.agents/skills/*\`.
4. Verify managed blocks are not duplicated.
5. Verify remote sources are trusted or pinned.
6. Run \`airules doctor\` when possible.
`
}

function writeFileIfAllowed(options: {
  filePath: string
  content: string
  force: boolean
  created: string[]
  skipped: string[]
}): void {
  mkdirSync(dirname(options.filePath), {
    recursive: true,
  })

  if (existsSync(options.filePath) && !options.force) {
    const existing = readFileSync(options.filePath, 'utf8')
    if (existing.length > 0) {
      options.skipped.push(options.filePath)
      return
    }
  }

  writeFileSync(options.filePath, options.content)
  options.created.push(options.filePath)
}

function renderLockfile(lockfile: AirulesLockfile): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`
}
