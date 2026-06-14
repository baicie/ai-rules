import type { AirulesPack } from '@baicie/airules-schema'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInstall } from './install-renderer'

let currentTmpDir: string | null = null

function createRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-render-'))
  mkdirSync(join(currentTmpDir, 'modules'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'blocks'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'templates'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'files/.cursor/rules'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'skills/shadcn-page'), { recursive: true })
  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, { recursive: true, force: true })
    currentTmpDir = null
  }
})

function getInstall(
  pack: AirulesPack,
  index = 0,
): AirulesPack['installs'][number] {
  const install = pack.installs[index]
  if (!install) {
    throw new Error('install missing')
  }
  return install
}

describe('renderInstall', () => {
  it('renders modules install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'modules/core.md'), '## Core\n')

    const pack: AirulesPack = {
      name: '@baicie/test',
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
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: getInstall(pack),
    })

    expect(rendered.files).toHaveLength(1)
    expect(rendered.modules).toEqual(['core'])
    expect(rendered.files[0] && rendered.files[0].content).toBe('## Core\n')
  })

  it('renders template install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'blocks/core.md'), '## Core\n')
    writeFileSync(join(root, 'templates/AGENTS.md.hbs'), '{{block "core"}}')

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      blocks: {
        core: 'blocks/core.md',
      },
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'template',
          template: 'templates/AGENTS.md.hbs',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: getInstall(pack),
    })

    expect(rendered.blocks).toEqual(['core'])
    expect(rendered.files[0] && rendered.files[0].content).toContain('## Core')
  })

  it('renders file install', () => {
    const root = createRoot()
    writeFileSync(join(root, 'files/.cursor/rules/shadcn.mdc'), '---\n---\n')

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/shadcn.mdc',
          mode: 'file',
          from: 'files/.cursor/rules/shadcn.mdc',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: getInstall(pack),
    })

    expect(rendered.files[0] && rendered.files[0].target).toBe(
      '.cursor/rules/shadcn.mdc',
    )
    expect(rendered.files[0] && rendered.files[0].content).toBe('---\n---\n')
  })

  it('renders directory install', () => {
    const root = createRoot()
    writeFileSync(
      join(root, 'skills/shadcn-page/SKILL.md'),
      '---\nname: test\n---\n',
    )

    const pack: AirulesPack = {
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'skill',
          agent: 'skill',
          target: '.agents/skills/shadcn-page',
          mode: 'directory',
          from: 'skills/shadcn-page',
        },
      ],
    }

    const rendered = renderInstall({
      pack,
      packRoot: root,
      install: getInstall(pack),
    })

    expect(rendered.files).toHaveLength(1)
    expect(rendered.files[0] && rendered.files[0].target).toBe(
      '.agents/skills/shadcn-page/SKILL.md',
    )
    expect(rendered.files[0] && rendered.files[0].content).toContain(
      'name: test',
    )
  })
})
