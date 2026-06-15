import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLocalPack } from './pack-loader'
import { resolveLocalPackSource } from './source'

let currentTmpDir: string | null = null

function createTempDir(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-pack-'))
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

describe('loadLocalPack', () => {
  it('loads and validates airules.pack.json', () => {
    const root = createTempDir()

    writeFileSync(
      join(root, 'airules.pack.json'),
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
          },
        ],
      }),
    )

    const source = resolveLocalPackSource(root)
    const loaded = loadLocalPack(source)

    expect(loaded.pack.name).toBe('@baicie/react-shadcn')
    expect(loaded.root).toBe(root)
    expect(loaded.rawContent).toContain('@baicie/react-shadcn')
  })

  it('throws when pack file is missing', () => {
    const root = createTempDir()
    const source = resolveLocalPackSource(root)

    expect(() => loadLocalPack(source)).toThrow(/Cannot find airules.pack.json/)
  })

  it('loads an AgentMD markdown snippet as a pack', () => {
    const root = createTempDir()
    mkdirSync(join(root, 'agents'), {
      recursive: true,
    })

    writeFileSync(
      join(root, 'agents/code-splitting.md'),
      '## Code Splitting\n\n- Keep files focused.\n',
    )

    const source = resolveLocalPackSource('agents/code-splitting', root)
    const loaded = loadLocalPack(source)

    expect(loaded.pack.name).toBe('@local/agentmd-code-splitting')
    expect(loaded.pack.modules).toEqual({
      main: 'code-splitting.md',
    })
    expect(loaded.pack.installs[0] && loaded.pack.installs[0].target).toBe(
      'AGENTS.md',
    )
    expect(loaded.root).toBe(join(root, 'agents'))
    expect(loaded.rawContent).toContain('## Code Splitting')
  })
})
