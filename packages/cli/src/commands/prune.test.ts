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
import { runPruneCommand } from './prune'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-prune-'))
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

describe('runPruneCommand', () => {
  it('prunes stale lock entries', async () => {
    const cwd = createProject()

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
              installId: 'missing',
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

    await runPruneCommand({
      cwd,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).not.toContain('"installId": "missing"')
  })
})
