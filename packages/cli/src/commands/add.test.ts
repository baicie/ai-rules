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
import { runAddCommand } from './add'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-add-'))

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/modules'), {
    recursive: true,
  })

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
    '## Core\n\n- Use TypeScript.',
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

describe('runAddCommand', () => {
  it('awaits installation and writes files before resolving', async () => {
    const cwd = createProject()

    await runAddCommand({
      cwd,
      source: './packs/react-shadcn',
      agent: 'codex',
    })

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')

    const config = readFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      'utf8',
    )
    expect(config).toContain('@baicie/react-shadcn')
  })

  it('does not write target files in dry-run mode', async () => {
    const cwd = createProject()

    await runAddCommand({
      cwd,
      source: './packs/react-shadcn',
      agent: 'codex',
      dryRun: true,
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
  })
})
