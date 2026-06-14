import { describe, expect, it } from 'vitest'
import { AirulesConfigSchema, AirulesRegistrySchema } from './index'

describe('airulesRegistrySchema', () => {
  it('parses registry', () => {
    const registry = {
      name: '@baicie/default',
      version: '0.1.0',
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
          version: '0.1.0',
          description: 'React shadcn rules',
          tags: ['react', 'shadcn'],
          aliases: ['react-shadcn', 'shadcn'],
        },
      ],
    }

    expect(AirulesRegistrySchema.parse(registry)).toEqual(registry)
  })

  it('rejects registry pack without source', () => {
    expect(() =>
      AirulesRegistrySchema.parse({
        packs: [
          {
            name: '@baicie/react-shadcn',
          },
        ],
      }),
    ).toThrow()
  })
})

describe('airulesConfigSchema registries', () => {
  it('parses config registries', () => {
    const config = {
      version: 1,
      registries: [
        {
          name: 'default',
          source: './registry.json',
        },
      ],
      packs: [],
    }

    expect(AirulesConfigSchema.parse(config)).toEqual(config)
  })
})
