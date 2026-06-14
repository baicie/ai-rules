import type { AirulesPack } from '@baicie/airules-schema'
import { describe, expect, it } from 'vitest'
import { resolveProfile, selectInstalls } from './profile'

const pack: AirulesPack = {
  name: '@baicie/react-shadcn',
  version: '0.1.0',
  profiles: {
    default: {
      installs: ['codex', 'cursor'],
      variables: {
        packageManager: 'pnpm',
        requireTests: false,
      },
    },
    strict: {
      extends: 'default',
      installs: ['copilot'],
      variables: {
        requireTests: true,
        allowAny: false,
      },
    },
  },
  installs: [
    {
      id: 'codex',
      agent: 'codex',
      target: 'AGENTS.md',
      mode: 'modules',
      concat: ['core'],
    },
    {
      id: 'cursor',
      agent: 'cursor',
      target: '.cursor/rules/rule.mdc',
      mode: 'file',
      from: 'files/cursor.mdc',
    },
    {
      id: 'copilot',
      agent: 'copilot',
      target: '.github/copilot-instructions.md',
      mode: 'modules',
      concat: ['core'],
    },
  ],
}

describe('resolveProfile', () => {
  it('merges extends installs and variables', () => {
    const profile = resolveProfile(pack, 'strict')

    expect(profile).toEqual({
      name: 'strict',
      installs: ['codex', 'cursor', 'copilot'],
      variables: {
        packageManager: 'pnpm',
        requireTests: true,
        allowAny: false,
      },
    })
  })

  it('throws for missing profile', () => {
    expect(() => resolveProfile(pack, 'missing')).toThrow(
      /Profile "missing" does not exist/,
    )
  })

  it('throws for circular profile extends', () => {
    const circularPack: AirulesPack = {
      name: '@baicie/circular',
      version: '0.1.0',
      profiles: {
        a: {
          extends: 'b',
        },
        b: {
          extends: 'a',
        },
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

    expect(() => resolveProfile(circularPack, 'a')).toThrow(
      /Circular profile extends detected/,
    )
  })
})

describe('selectInstalls', () => {
  it('selects installs by profile', () => {
    const installs = selectInstalls(pack, {
      profile: 'strict',
    })

    expect(installs.map(install => install.id)).toEqual([
      'codex',
      'cursor',
      'copilot',
    ])
  })

  it('filters installs by agents', () => {
    const installs = selectInstalls(pack, {
      profile: 'strict',
      agents: ['cursor'],
    })

    expect(installs.map(install => install.id)).toEqual(['cursor'])
  })

  it('throws when profile references missing install id', () => {
    const invalidPack: AirulesPack = {
      name: '@baicie/invalid',
      version: '0.1.0',
      profiles: {
        default: {
          installs: ['missing'],
        },
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

    expect(() => selectInstalls(invalidPack)).toThrow(
      /Profile references missing install ids: missing/,
    )
  })
})
