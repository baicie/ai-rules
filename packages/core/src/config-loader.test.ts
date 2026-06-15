import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getAirulesAgentDir,
  getAirulesLockPath,
  loadAirulesConfigSync,
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

    expect(resolved && resolved.filename).toBe('airules.config.json')
  })

  it('loads json config synchronously', () => {
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

    const config = loadAirulesConfigSync(cwd)

    expect(config.version).toBe(1)
    expect(config.packs[0] && config.packs[0].source).toBe(
      './packs/react-shadcn',
    )
  })

  it('loads TypeScript config synchronously', () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      `
export default {
  version: 1,
  packs: [
    {
      source: "./packs/react-shadcn",
      profile: "strict",
      agents: ["codex", "cursor"]
    }
  ],
  security: {
    allowScripts: false
  }
}
`,
    )

    const config = loadAirulesConfigSync(cwd)

    expect(config.version).toBe(1)
    const first = config.packs[0]
    expect(first && first.profile).toBe('strict')
    expect(first && first.agents).toEqual(['codex', 'cursor'])
  })

  it('throws when config does not exist', () => {
    const cwd = createTempProject()

    expect(() => loadAirulesConfigSync(cwd)).toThrow(
      /Cannot find airules config/,
    )
  })

  it('loads minimal config with schema defaults', () => {
    const cwd = createTempProject()

    writeFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      `export default {
  packs: [],
}
`,
    )

    const config = loadAirulesConfigSync(cwd)

    expect(config).toEqual({
      version: 1,
      packs: [],
    })
  })
})
