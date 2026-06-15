import { describe, expect, it } from 'vitest'
import {
  createDefaultConfig,
  defineAirulesConfig,
  defineAirulesPack,
  defineConfig,
  definePack,
} from './define'

describe('define helpers', () => {
  it('defines minimal user config', () => {
    const config = defineConfig({
      packs: [],
    })

    expect(config).toEqual({
      packs: [],
    })
  })

  it('keeps defineAirulesConfig compatibility', () => {
    const config = defineAirulesConfig({
      packs: [
        {
          source: 'shadcn',
        },
      ],
    })

    expect(config.packs?.[0]?.source).toBe('shadcn')
  })

  it('defines pack', () => {
    const pack = definePack({
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core'],
        },
      ],
    })

    expect(pack.name).toBe('@baicie/test')
  })

  it('keeps defineAirulesPack compatibility', () => {
    const pack = defineAirulesPack({
      name: '@baicie/test',
      version: '0.1.0',
      installs: [
        {
          id: 'codex',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core'],
        },
      ],
    })

    expect(pack.version).toBe('0.1.0')
  })

  it('creates default normalized config', () => {
    expect(createDefaultConfig()).toEqual({
      version: 1,
      packs: [],
    })
  })
})
