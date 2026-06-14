import type { AirulesConfig, AirulesPack } from './index'
import { describe, expect, it } from 'vitest'
import { AirulesConfigSchema, AirulesPackSchema } from './index'

describe('airulesPackSchema', () => {
  it('parses a modules install pack', () => {
    const pack: AirulesPack = {
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      modules: {
        core: 'modules/001-core.md',
      },
      installs: [
        {
          id: 'codex-agents',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
          concat: ['core'],
          merge: 'managed-block',
          placement: {
            type: 'append',
          },
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).not.toThrow()
  })

  it('rejects modules mode without concat', () => {
    const pack = {
      name: '@baicie/invalid',
      version: '0.1.0',
      installs: [
        {
          id: 'codex-agents',
          agent: 'codex',
          target: 'AGENTS.md',
          mode: 'modules',
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).toThrow(
      /modules mode requires non-empty concat/,
    )
  })

  it('rejects template mode without template', () => {
    const pack = {
      name: '@baicie/invalid',
      version: '0.1.0',
      installs: [
        {
          id: 'cursor',
          agent: 'cursor',
          target: '.cursor/rules/rule.mdc',
          mode: 'template',
          blocks: ['core'],
        },
      ],
    }

    expect(() => AirulesPackSchema.parse(pack)).toThrow(
      /template mode requires template/,
    )
  })
})

describe('airulesConfigSchema', () => {
  it('parses config', () => {
    const config: AirulesConfig = {
      version: 1,
      packs: [
        {
          source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
          profile: 'strict',
          agents: ['codex', 'cursor'],
          variables: {
            packageManager: 'pnpm',
          },
        },
      ],
      security: {
        allowScripts: false,
      },
    }

    expect(AirulesConfigSchema.parse(config)).toEqual(config)
  })
})
