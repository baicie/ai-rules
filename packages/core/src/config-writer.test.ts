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
import { loadAirulesConfigSync } from './config-loader'
import { upsertConfigPack, writeAirulesConfig } from './config-writer'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-config-'))
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

describe('config-writer', () => {
  it('upserts config pack by source', () => {
    const config = upsertConfigPack(
      {
        version: 1,
        packs: [
          {
            source: './packs/a',
            agents: ['codex'],
          },
        ],
      },
      {
        name: '@baicie/a',
        source: './packs/a',
        profile: 'strict',
        agents: ['codex', 'cursor'],
      },
    )

    expect(config.packs).toHaveLength(1)
    expect(config.packs[0] && config.packs[0].name).toBe('@baicie/a')
    expect(config.packs[0] && config.packs[0].profile).toBe('strict')
    expect(config.packs[0] && config.packs[0].agents).toEqual([
      'codex',
      'cursor',
    ])
  })

  it('writes json config when current config is json', () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [],
      }),
    )

    writeAirulesConfig(cwd, {
      version: 1,
      packs: [
        {
          source: './packs/react-shadcn',
        },
      ],
    })

    const raw = readFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      'utf8',
    )

    expect(raw).toContain('./packs/react-shadcn')

    const loaded = loadAirulesConfigSync(cwd)
    expect(loaded.packs[0] && loaded.packs[0].source).toBe(
      './packs/react-shadcn',
    )
  })

  it('writes ts config by default', () => {
    const cwd = createTempProject()

    writeAirulesConfig(cwd, {
      version: 1,
      packs: [
        {
          source: './packs/react-shadcn',
        },
      ],
    })

    const raw = readFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      'utf8',
    )

    expect(raw).toContain('export default')
    expect(raw).toContain('./packs/react-shadcn')

    const loaded = loadAirulesConfigSync(cwd)
    expect(loaded.packs[0] && loaded.packs[0].source).toBe(
      './packs/react-shadcn',
    )
  })
})
