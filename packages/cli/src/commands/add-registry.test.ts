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
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-add-registry-'))

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
      registries: [
        {
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
          aliases: ['shadcn'],
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
    '## Core\n\n- From registry alias.\n',
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

describe('runAddCommand with registry alias', () => {
  it('resolves alias and installs pack', async () => {
    const cwd = createProject()

    await runAddCommand({
      cwd,
      source: 'shadcn',
      agent: 'codex',
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true)
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain(
      'From registry alias',
    )

    const config = readFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      'utf8',
    )

    expect(config).toContain('@baicie/react-shadcn')
    expect(config).toContain('./packs/react-shadcn')
  })
})
