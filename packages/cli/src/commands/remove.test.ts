import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createManagedBlock } from '@baicie/airules-core'
import { afterEach, describe, expect, it } from 'vitest'
import { runRemoveCommand } from './remove'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-remove-'))
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

describe('runRemoveCommand', () => {
  it('removes installed pack', async () => {
    const cwd = createProject()

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
              source: './pack',
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
          ],
        },
        null,
        2,
      ),
    )

    await runRemoveCommand({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).not.toContain(
      'airules:start',
    )
  })
})
