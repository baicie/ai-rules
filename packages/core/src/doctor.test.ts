import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDoctor } from './doctor'
import { sha256 } from './hash'
import { createManagedBlock } from './managed-block'

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

  it('reports missing target files as error', () => {
    const cwd = createProject()
    writeLock(cwd, sha256('cursor content\n'))

    const result = runDoctor({
      cwd,
    })

    expect(result.ok).toBe(false)
    expect(
      result.issues.filter(issue => issue.code === 'target-missing'),
    ).toHaveLength(2)
  })
})
