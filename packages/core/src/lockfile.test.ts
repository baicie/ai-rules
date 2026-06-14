import { describe, expect, it } from 'vitest'
import { createEmptyLockfile, upsertLockEntries } from './lockfile'

describe('lockfile', () => {
  it('creates empty lockfile', () => {
    const lockfile = createEmptyLockfile('0.0.0')

    expect(lockfile.lockfileVersion).toBe(1)
    expect(lockfile.airulesVersion).toBe('0.0.0')
    expect(lockfile.packs).toEqual([])
    expect(lockfile.installs).toEqual([])
  })

  it('upserts pack and install entries', () => {
    const lockfile = createEmptyLockfile()

    const next = upsertLockEntries(
      lockfile,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          merge: 'managed-block',
          modules: ['core'],
          contentHash: 'sha256-content',
        },
      ],
    )

    expect(next.packs).toHaveLength(1)
    expect(next.installs).toHaveLength(1)
    expect(next.installs[0] && next.installs[0].installId).toBe('codex')
  })

  it('replaces same pack install entry', () => {
    const lockfile = createEmptyLockfile()

    const first = upsertLockEntries(
      lockfile,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          contentHash: 'sha256-old',
        },
      ],
    )

    const second = upsertLockEntries(
      first,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          contentHash: 'sha256-new',
        },
      ],
    )

    expect(second.installs).toHaveLength(1)
    expect(second.installs[0] && second.installs[0].contentHash).toBe(
      'sha256-new',
    )
  })

  it('merges pack agents when upserting the same pack', () => {
    const lockfile = createEmptyLockfile()

    const first = upsertLockEntries(
      lockfile,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        agents: ['codex'],
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          contentHash: 'sha256-codex',
        },
      ],
    )

    const second = upsertLockEntries(
      first,
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        source: './packs/react-shadcn',
        resolved: {
          type: 'local',
          path: '/repo/packs/react-shadcn',
        },
        agents: ['copilot'],
        hash: 'sha256-pack',
      },
      [
        {
          pack: '@baicie/react-shadcn',
          installId: 'copilot',
          agent: 'copilot',
          target: '.github/copilot-instructions.md',
          mode: 'modules',
          contentHash: 'sha256-copilot',
        },
      ],
    )

    expect(second.packs[0]?.agents).toEqual(['codex', 'copilot'])
    expect(second.installs.map(install => install.installId)).toEqual([
      'codex',
      'copilot',
    ])
  })
})
