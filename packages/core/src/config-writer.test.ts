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
  it('preserves top-level install and security settings', () => {
    const config = upsertConfigPack(
      {
        version: 1,
        packs: [],
        install: {
          conflict: 'stage',
        },
        security: {
          trustedSources: ['github:baicie/ai-rules'],
          allowScripts: false,
          requirePinnedVersion: true,
        },
      },
      {
        name: '@baicie/react-shadcn',
        source: './packs/react-shadcn',
        agents: ['codex'],
      },
    )

    expect(config.install && config.install.conflict).toBe('stage')
    expect(config.security && config.security.trustedSources).toEqual([
      'github:baicie/ai-rules',
    ])
    expect(config.security && config.security.requirePinnedVersion).toBe(true)
  })

  it('upserts config pack by source and merges agents', () => {
    const config = upsertConfigPack(
      {
        version: 1,
        packs: [
          {
            source: './packs/react-shadcn',
            agents: ['codex'],
          },
        ],
      },
      {
        name: '@baicie/react-shadcn',
        source: './packs/react-shadcn',
        profile: 'strict',
        agents: ['cursor'],
      },
    )

    expect(config.packs).toHaveLength(1)
    expect(config.packs[0] && config.packs[0].name).toBe('@baicie/react-shadcn')
    expect(config.packs[0] && config.packs[0].profile).toBe('strict')
    expect(config.packs[0] && config.packs[0].agents).toEqual([
      'codex',
      'cursor',
    ])
  })

  it('merges variables while incoming values win', () => {
    const config = upsertConfigPack(
      {
        version: 1,
        packs: [
          {
            name: '@baicie/react-shadcn',
            source: './packs/react-shadcn',
            variables: {
              packageManager: 'npm',
              uiAlias: '@/components/ui',
            },
          },
        ],
      },
      {
        name: '@baicie/react-shadcn',
        source: './packs/react-shadcn',
        variables: {
          packageManager: 'pnpm',
          bizAlias: '@/components/biz',
        },
      },
    )

    expect(config.packs[0] && config.packs[0].variables).toEqual({
      packageManager: 'pnpm',
      uiAlias: '@/components/ui',
      bizAlias: '@/components/biz',
    })
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

    expect(raw).toContain('airules config')
    expect(raw).toContain('./packs/react-shadcn')

    const loaded = loadAirulesConfigSync(cwd)
    expect(loaded.packs[0] && loaded.packs[0].source).toBe(
      './packs/react-shadcn',
    )
  })
})
