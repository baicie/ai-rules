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
    .replace(/[^\w.-]/g, '-')
    .replace(/-+/g, '-')
}
