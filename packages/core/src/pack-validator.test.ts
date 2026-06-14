import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validatePack } from './pack-validator'

let currentTmpDir: string | null = null

function createPack(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-validate-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

  return packRoot
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

describe('validatePack', () => {
  it('validates a correct pack', () => {
    const packRoot = createPack()

    const result = validatePack({
      packPath: packRoot,
    })

    expect(result.ok).toBe(true)
    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(
      result.issues.some(issue => issue.code === 'pack-schema-valid'),
    ).toBe(true)
  })

  it('reports missing module file', () => {
    const packRoot = createPack()

    writeFileSync(
      join(packRoot, 'airules.pack.json'),
      JSON.stringify({
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        modules: {
          core: 'modules/missing.md',
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

    const result = validatePack({
      packPath: packRoot,
    })

    expect(result.ok).toBe(false)
    expect(
      result.issues.some(issue => issue.code === 'module-file-missing'),
    ).toBe(true)
  })
})
