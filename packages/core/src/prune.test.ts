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
import { createManagedBlock } from './managed-block'
import { pruneAirules } from './prune'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-prune-'))
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
            installId: 'missing',
            agent: 'cursor',
            target: '.cursor/missing.mdc',
            mode: 'file',
            merge: 'overwrite-managed',
            files: [
              {
                target: '.cursor/missing.mdc',
                contentHash: 'sha256-missing',
              },
            ],
            contentHash: 'sha256-missing',
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

describe('pruneAirules', () => {
  it('prunes missing install entries and keeps existing managed block', () => {
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

    const result = pruneAirules({
      cwd,
    })

    expect(result.operations).toEqual([
      {
        pack: '@baicie/react-shadcn',
        installId: 'codex',
        action: 'keep',
        reason: 'managed block exists',
      },
      {
        pack: '@baicie/react-shadcn',
        installId: 'missing',
        action: 'prune',
        reason: 'all targets are missing or managed block is missing',
      },
    ])

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).toContain('"installId": "codex"')
    expect(lock).not.toContain('"installId": "missing"')
  })

  it('supports dry-run without changing lockfile', () => {
    const cwd = createProject()
    writeLock(cwd)

    pruneAirules({
      cwd,
      dryRun: true,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).toContain('"installId": "missing"')
  })
})
