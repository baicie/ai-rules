import { describe, expect, it } from 'vitest'
import {
  createManagedBlock,
  findManagedBlockRange,
  hasManagedBlock,
  insertByPlacement,
  removeManagedBlock,
  replaceManagedBlock,
  upsertManagedBlock,
} from './managed-block'

describe('managed block', () => {
  it('creates managed block with hash', () => {
    const block = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Rules\n\n- Use shadcn/ui.\n',
    )

    expect(block).toContain(
      '<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" hash="sha256-',
    )
    expect(block).toContain('## Rules')
    expect(block).toContain(
      '<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->',
    )
  })

  it('finds managed block range', () => {
    const source = [
      '# AGENTS.md',
      '',
      '<!-- airules:start pack="@baicie/react-shadcn" install="codex-agents" version="0.1.0" hash="sha256-xxx" -->',
      '## Rules',
      '<!-- airules:end pack="@baicie/react-shadcn" install="codex-agents" -->',
      '',
      'After',
    ].join('\n')

    const range = findManagedBlockRange(source, {
      pack: '@baicie/react-shadcn',
      install: 'codex-agents',
    })

    expect(range).not.toBeNull()
    expect(source.slice(range!.start, range!.end)).toContain('## Rules')
  })

  it('replaces existing managed block', () => {
    const oldBlock = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      'old',
    )

    const newBlock = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      'new',
    )

    const source = `before\n\n${oldBlock}\n\nafter`
    const next = replaceManagedBlock(
      source,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
      },
      newBlock,
    )

    expect(next).toContain('new')
    expect(next).not.toContain('old')
    expect(next).toContain('before')
    expect(next).toContain('after')
  })

  it('inserts after heading', () => {
    const source = '# AGENTS.md\n\n## AI Rules\n\n## Commands\n'
    const next = insertByPlacement(source, 'INSERTED', {
      type: 'after-heading',
      heading: '## AI Rules',
    })

    expect(next).toContain('## AI Rules\n\nINSERTED\n\n## Commands')
  })

  it('uses fallback append when heading does not exist', () => {
    const source = '# AGENTS.md\n'
    const next = insertByPlacement(source, 'INSERTED', {
      type: 'after-heading',
      heading: '## Missing',
      fallback: 'append',
    })

    expect(next).toBe('# AGENTS.md\n\nINSERTED\n')
  })

  it('upserts managed block', () => {
    const source = '# AGENTS.md\n'
    const next = upsertManagedBlock(
      source,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Rules',
      {
        type: 'append',
      },
    )

    const updated = upsertManagedBlock(
      next,
      {
        pack: '@baicie/react-shadcn',
        install: 'codex-agents',
        version: '0.1.0',
      },
      '## Updated Rules',
      {
        type: 'append',
      },
    )

    expect(updated).toContain('## Updated Rules')
    expect(updated).not.toContain('## Rules\n<!--')
  })

  it('removes managed block without removing user content', () => {
    const source = [
      '# AGENTS',
      '',
      '<!-- airules:start pack="@baicie/react-shadcn" install="codex" version="0.1.0" hash="sha256-x" -->',
      '## Core',
      '<!-- airules:end pack="@baicie/react-shadcn" install="codex" -->',
      '',
      '## Commands',
    ].join('\n')

    const next = removeManagedBlock(source, {
      pack: '@baicie/react-shadcn',
      install: 'codex',
    })

    expect(next).toContain('# AGENTS')
    expect(next).toContain('## Commands')
    expect(next).not.toContain('airules:start')
  })

  it('returns null when managed block is missing', () => {
    const next = removeManagedBlock('# no block\n', {
      pack: '@baicie/react-shadcn',
      install: 'codex',
    })

    expect(next).toBeNull()
  })

  it('hasManagedBlock returns true when present and false otherwise', () => {
    const source = createManagedBlock(
      {
        pack: '@baicie/react-shadcn',
        install: 'codex',
        version: '0.1.0',
      },
      '## Core\n',
    )

    expect(
      hasManagedBlock(source, {
        pack: '@baicie/react-shadcn',
        install: 'codex',
      }),
    ).toBe(true)

    expect(
      hasManagedBlock('# empty', {
        pack: '@baicie/react-shadcn',
        install: 'codex',
      }),
    ).toBe(false)
  })
})
