import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDiffCommand } from './diff'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-diff-'))

  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/modules'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
          agents: ['codex'],
        },
      ],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/airules.pack.json'),
    JSON.stringify({
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {
        core: 'modules/core.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core'],
          merge: 'managed-block',
        },
      ],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/core.md'),
    '## Core\n\n- Diff uses configured cwd.',
  )

  return currentTmpDir
}

afterEach(() => {
  vi.restoreAllMocks()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('runDiffCommand', () => {
  it('uses the provided cwd and prints managed block', async () => {
    const cwd = createProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runDiffCommand({
      cwd,
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('Diff uses configured cwd')
    expect(output).toContain('managed block')
  })
})
