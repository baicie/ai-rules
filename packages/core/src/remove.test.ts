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

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )
    expect(lock).toContain('@baicie/react-shadcn')
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

  it('throws when pack is not installed', () => {
    const cwd = createProject()
    writeLock(cwd)

    expect(() =>
      removePack({
        cwd,
        pack: '@baicie/never-installed',
      }),
    ).toThrow(/not installed/)
  })
})
