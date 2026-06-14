import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getAirulesAgentDir,
  getAirulesLockPath,
  loadAirulesConfig,
  resolveAirulesConfigPath,
} from './config-loader'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-'))
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

describe('config-loader', () => {
  it('resolves agent dir and lock path', () => {
    const cwd = '/repo'

    expect(getAirulesAgentDir(cwd)).toMatch(/[\\/]repo[\\/]\.agents[\\/]agent$/)
    expect(getAirulesLockPath(cwd)).toMatch(
      /[\\/]repo[\\/]\.agents[\\/]agent[\\/]airules\.lock\.json$/,
    )
  })

  it('resolves config file by lookup order', () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [],
      }),
    )

    const resolved = resolveAirulesConfigPath(cwd)

    expect(resolved?.filename).toBe('airules.config.json')
  })

  it('loads json config', async () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.json'),
      JSON.stringify({
        version: 1,
        packs: [
          {
            source: './packs/react-shadcn',
            agents: ['codex'],
          },
        ],
        security: {
          allowScripts: false,
        },
      }),
    )

    const config = await loadAirulesConfig(cwd)

    expect(config.version).toBe(1)
    expect(config.packs[0]?.source).toBe('./packs/react-shadcn')
  })

  it('throws when config does not exist', async () => {
    const cwd = createTempProject()

    await expect(loadAirulesConfig(cwd)).rejects.toThrow(
      /Cannot find airules config/,
    )
  })
})
