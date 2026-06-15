import type { AirulesConfig, AirulesPack } from './index'
import { describe, expect, it } from 'vitest'
import {
  AirulesConfigSchema,
  AirulesLockfileSchema,
  AirulesPackSchema,
} from './index'

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
          id: 'docs',
          agent: 'generic',
          target: 'docs/ai/rule.md',
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
          agents: ['codex', 'generic'],
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

  it('parses minimal config with defaults', () => {
    const config = AirulesConfigSchema.parse({})

    expect(config).toEqual({
      version: 1,
      packs: [],
    })
  })

  it('parses config with only packs', () => {
    const config = AirulesConfigSchema.parse({
      packs: [
        {
          source: 'shadcn',
        },
      ],
    })

    expect(config).toEqual({
      version: 1,
      packs: [
        {
          source: 'shadcn',
        },
      ],
    })
  })
})

describe('airulesLockfileSchema', () => {
  it('parses lock install files', () => {
    const lockfile = {
      lockfileVersion: 1,
      generatedAt: '2026-06-14T00:00:00.000Z',
      airulesVersion: '0.0.0',
      packs: [],
      installs: [
        {
          pack: '@baicie/react-shadcn',
          installId: 'docs',
          agent: 'generic',
          target: 'docs/ai/shadcn.md',
          mode: 'file',
          merge: 'overwrite-managed',
          files: [
            {
              target: 'docs/ai/shadcn.md',
              contentHash: 'sha256-file',
            },
          ],
          contentHash: 'sha256-install',
        },
      ],
    }

    expect(() => AirulesLockfileSchema.parse(lockfile)).not.toThrow()
  })
})
