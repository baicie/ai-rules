import type { AirulesPack } from '@baicie/airules-schema'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderModules } from './module-renderer'

let currentTmpDir: string | null = null

function createTempPackRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-modules-'))
  mkdirSync(join(currentTmpDir, 'modules'), {
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

describe('renderModules', () => {
  it('renders modules by concat order', () => {
    const root = createTempPackRoot()

    writeFileSync(join(root, 'modules/core.md'), '## Core')
    writeFileSync(join(root, 'modules/shadcn.md'), '## shadcn')

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {
        core: 'modules/core.md',
        shadcn: 'modules/shadcn.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core', 'shadcn'],
        },
      ],
    }

    const install = pack.installs[0]

    if (!install) {
      throw new Error('install missing')
    }

    const result = renderModules({
      pack,
      packRoot: root,
      install,
    })

    expect(result.moduleIds).toEqual(['core', 'shadcn'])
    expect(result.content).toBe('## Core\n\n## shadcn\n')
  })

  it('throws when module id is missing', () => {
    const root = createTempPackRoot()

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {},
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['missing'],
        },
      ],
    }

    const install = pack.installs[0]

    if (!install) {
      throw new Error('install missing')
    }

    expect(() =>
      renderModules({
        pack,
        packRoot: root,
        install,
      }),
    ).toThrow(/references missing module "missing"/)
  })

  it('throws for non-modules mode in Phase 1', () => {
    const root = createTempPackRoot()

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/rule.mdc',
          mode: 'file',
          from: 'files/rule.mdc',
        },
      ],
    }

    const install = pack.installs[0]

    if (!install) {
      throw new Error('install missing')
    }

    expect(() =>
      renderModules({
        pack,
        packRoot: root,
        install,
      }),
    ).toThrow(/Phase 1 only supports modules mode/)
  })
})
