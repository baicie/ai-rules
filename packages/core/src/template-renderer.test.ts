import type { AirulesPack } from '@baicie/airules-schema'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderTemplate, renderTemplateString } from './template-renderer'

let currentTmpDir: string | null = null

function createRoot(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-template-'))
  mkdirSync(join(currentTmpDir, 'blocks'), { recursive: true })
  mkdirSync(join(currentTmpDir, 'templates'), { recursive: true })
  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, { recursive: true, force: true })
    currentTmpDir = null
  }
})

describe('renderTemplateString', () => {
  it('renders blocks, variables, and if sections', () => {
    const result = renderTemplateString(
      [
        '# Rules',
        '{{block "core"}}',
        'pm={{packageManager}}',
        '{{#if requireTests}}run tests{{/if}}',
        '{{#if disabled}}hidden{{/if}}',
      ].join('\n'),
      {
        blocks: {
          core: '## Core',
        },
        variables: {
          packageManager: 'pnpm',
          requireTests: true,
          disabled: false,
        },
      },
    )

    expect(result).toContain('## Core')
    expect(result).toContain('pm=pnpm')
    expect(result).toContain('run tests')
    expect(result).not.toContain('hidden')
  })

  it('supports block colon syntax', () => {
    const result = renderTemplateString('{{block:core}}', {
      blocks: {
        core: '## Core',
      },
      variables: {},
    })

    expect(result).toBe('## Core')
  })
})

describe('renderTemplate', () => {
  it('renders template from pack blocks', () => {
    const root = createRoot()

    writeFileSync(join(root, 'blocks/core.md'), '## Core\n')
    writeFileSync(
      join(root, 'templates/AGENTS.md.hbs'),
      '{{block "core"}}\npackage={{packageManager}}\n',
    )

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
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

    const install = pack.installs[0]
    if (!install) {
      throw new Error('install missing')
    }

    const rendered = renderTemplate({
      pack,
      packRoot: root,
      install,
      variables: {
        packageManager: 'pnpm',
      },
    })

    expect(rendered.blockIds).toEqual(['core'])
    expect(rendered.content).toContain('## Core')
    expect(rendered.content).toContain('package=pnpm')
  })

  it('throws when template references missing block', () => {
    const root = createRoot()

    writeFileSync(join(root, 'templates/AGENTS.md.hbs'), '{{block "missing"}}')

    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      blocks: {},
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

    const install = pack.installs[0]
    if (!install) {
      throw new Error('install missing')
    }

    expect(() =>
      renderTemplate({
        pack,
        packRoot: root,
        install,
      }),
    ).toThrow(/missing block "missing"/)
  })
})
