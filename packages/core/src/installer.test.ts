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
import { createDryRunBlockForOperation, installLocalPack } from './installer'
import { readAirulesLockfile } from './lockfile'

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
  it('installs modules into AGENTS.md with managed block', () => {
    const cwd = createTempProject()

    writeFileSync(join(cwd, 'AGENTS.md'), '# AGENTS.md\n\n## AI Rules\n')

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0] && result.operations[0].action).toBe('update')

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')

    expect(agents).toContain('<!-- airules:start')
    expect(agents).toContain('pack="@baicie/react-shadcn"')
    expect(agents).toContain('install="codex"')
    expect(agents).toContain('## Core')
    expect(agents).toContain('## shadcn')

    const lockfile = readAirulesLockfile(cwd)

    expect(lockfile.packs[0] && lockfile.packs[0].name).toBe(
      '@baicie/react-shadcn',
    )
    expect(lockfile.installs[0] && lockfile.installs[0].installId).toBe('codex')
    expect(lockfile.installs[0] && lockfile.installs[0].modules).toEqual([
      'core',
      'shadcn',
    ])
  })

  it('creates target file when missing', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true)

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')
  })

  it('supports dry-run without writing files or lockfile', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    expect(result.operations[0] && result.operations[0].action).toBe('create')
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(false)
  })

  it('selects installs by profile and agent', () => {
    const cwd = createTempProject()

    installLocalPack({
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
    const installIds = lockfile.installs.map(install => install.installId)
    expect(installIds).toEqual(['copilot'])
  })

  it('updates existing managed block instead of duplicating', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    writeFileSync(
      join(cwd, 'packs/react-shadcn/modules/shadcn.md'),
      '## shadcn\n\n- Updated rule.',
    )

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    const matches = agents.match(/airules:start/g)

    expect(matches).not.toBeNull()
    expect(matches && matches.length).toBe(1)
    expect(agents).toContain('- Updated rule.')
  })

  it('rejects non-managed-block merge in Phase 1', () => {
    const cwd = createTempProject()
    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const raw = readFileSync(packPath, 'utf8')
    const pack = JSON.parse(raw) as {
      installs: Array<{ merge?: string }>
    }

    if (pack.installs[0]) {
      pack.installs[0].merge = 'overwrite-managed'
    }

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    expect(() =>
      installLocalPack({
        cwd,
        source: './packs/react-shadcn',
        agents: ['codex'],
      }),
    ).toThrow(/Phase 1 only supports managed-block merge/)
  })

  it('returns stable dry-run managed block content', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    const operation = result.operations[0]
    expect(operation).toBeDefined()
    if (!operation) {
      return
    }
    expect(operation.managedBlock).toContain('install="codex"')
    expect(operation.managedBlock).toContain('## Core')
    expect(operation.managedBlock).toContain('## shadcn')
    expect(operation.managedBlock).not.toContain('# AGENTS.md')
  })

  it('marks unchanged when running same install twice', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.operations[0] && result.operations[0].action).toBe(
      'unchanged',
    )
  })

  it('createDryRunBlockForOperation returns the generated managed block only', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    const operation = result.operations[0]
    expect(operation).toBeDefined()
    if (!operation) {
      return
    }

    const block = createDryRunBlockForOperation(operation)

    expect(block).toBe(operation.managedBlock)
    expect(block).toContain('<!-- airules:start')
    expect(block).toContain('## Core')
  })
})
