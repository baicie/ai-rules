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
  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/files/docs/ai'), {
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
            installs: ['codex', 'docs', 'skill'],
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
            id: 'docs',
            agent: 'generic',
            target: 'docs/ai/shadcn.md',
            mode: 'file',
            from: 'files/docs/ai/shadcn.md',
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
    join(currentTmpDir, 'packs/react-shadcn/files/docs/ai/shadcn.md'),
    '# Docs shadcn\n',
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
      'docs/ai/shadcn.md',
      '.agents/skills/shadcn-page/SKILL.md',
    ])

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')
    expect(agents).toContain('## shadcn')
    expect(agents).toContain('package=pnpm')
    expect(agents).toContain('## Testing')
    expect(agents).toContain('<!-- airules:start')

    const docs = readFileSync(join(cwd, 'docs/ai/shadcn.md'), 'utf8')
    expect(docs).toContain('# Docs shadcn')
    expect(docs).not.toContain('airules:managed')

    const skill = readFileSync(
      join(cwd, '.agents/skills/shadcn-page/SKILL.md'),
      'utf8',
    )
    expect(skill.startsWith('---')).toBe(true)
    expect(skill).toContain('name: shadcn-page')

    const lockfile = readAirulesLockfile(cwd)
    expect(lockfile.installs).toHaveLength(3)
    const codexInstall = lockfile.installs.find(
      install => install.installId === 'codex',
    )
    expect(codexInstall && codexInstall.blocks).toEqual([
      'core',
      'shadcn',
      'testing',
    ])
    const skillInstall = lockfile.installs.find(
      install => install.installId === 'skill',
    )
    expect(
      skillInstall &&
        skillInstall.files &&
        skillInstall.files[0] &&
        skillInstall.files[0].target,
    ).toBe('.agents/skills/shadcn-page/SKILL.md')
  })

  it('refuses to overwrite unmanaged file for overwrite-managed', () => {
    const cwd = createProject()

    mkdirSync(join(cwd, 'docs/ai'), {
      recursive: true,
    })

    writeFileSync(join(cwd, 'docs/ai/shadcn.md'), 'user content')

    expect(() =>
      installLocalPack({
        cwd,
        source: './packs/react-shadcn',
        agents: ['generic'],
      }),
    ).toThrow(/Refusing to overwrite unmanaged file/)
  })

  it('allows overwrite-managed update after lockfile records file hash', () => {
    const cwd = createProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['generic'],
    })

    writeFileSync(
      join(cwd, 'packs/react-shadcn/files/docs/ai/shadcn.md'),
      '# Updated\n',
    )

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['generic'],
    })

    expect(result.operations[0] && result.operations[0].action).toBe('update')

    const docs = readFileSync(join(cwd, 'docs/ai/shadcn.md'), 'utf8')
    expect(docs).toContain('# Updated')
  })

  it('supports manual merge by staging generated content', () => {
    const cwd = createProject()
    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
      installs: Array<{ merge?: string }>
    }

    if (pack.installs[1]) {
      pack.installs[1].merge = 'manual'
    }

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['generic'],
    })

    expect(result.operations[0] && result.operations[0].action).toBe('stage')
    expect(existsSync(join(cwd, 'docs/ai/shadcn.md'))).toBe(false)
    expect(
      existsSync(
        join(
          cwd,
          '.agents/agent/staged/_baicie_react-shadcn/docs/docs/ai/shadcn.md',
        ),
      ),
    ).toBe(true)
  })
})
