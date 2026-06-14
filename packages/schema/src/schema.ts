import { z } from 'zod/v3'

export const PlacementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('append'),
  }),
  z.object({
    type: z.literal('prepend'),
  }),
  z.object({
    type: z.literal('after-heading'),
    heading: z.string().min(1),
    fallback: z.enum(['append', 'prepend', 'error']).optional(),
  }),
  z.object({
    type: z.literal('before-heading'),
    heading: z.string().min(1),
    fallback: z.enum(['append', 'prepend', 'error']).optional(),
  }),
  z.object({
    type: z.literal('replace-file'),
  }),
])

export const AgentNameSchema = z.string().min(1)

export const InstallModeSchema = z.enum([
  'modules',
  'template',
  'file',
  'directory',
])

export const MergeStrategySchema = z.enum([
  'managed-block',
  'overwrite-managed',
  'skip-if-exists',
  'manual',
])

export const AirulesProfileSchema = z.object({
  description: z.string().optional(),
  extends: z.string().optional(),
  installs: z.array(z.string().min(1)).optional(),
  variables: z.record(z.unknown()).optional(),
})

export const AirulesInstallSchema = z
  .object({
    id: z.string().min(1),
    agent: AgentNameSchema,
    target: z.string().min(1),
    mode: InstallModeSchema,

    placement: PlacementSchema.optional(),
    merge: MergeStrategySchema.optional(),

    concat: z.array(z.string().min(1)).optional(),
    blocks: z.array(z.string().min(1)).optional(),

    template: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
  })
  .superRefine((install, ctx) => {
    if (install.mode === 'modules' && !install.concat?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'modules mode requires non-empty concat',
        path: ['concat'],
      })
    }

    if (install.mode === 'template' && !install.template) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'template mode requires template',
        path: ['template'],
      })
    }

    if (
      (install.mode === 'file' || install.mode === 'directory') &&
      !install.from
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${install.mode} mode requires from`,
        path: ['from'],
      })
    }
  })

export const AirulesPackSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),

  engines: z
    .object({
      airules: z.string().optional(),
    })
    .optional(),

  profiles: z.record(AirulesProfileSchema).optional(),

  modules: z.record(z.string().min(1)).optional(),
  blocks: z.record(z.string().min(1)).optional(),

  installs: z.array(AirulesInstallSchema).min(1),

  detect: z
    .object({
      files: z.array(z.string()).optional(),
      packageJson: z
        .object({
          dependencies: z.array(z.string()).optional(),
          devDependencies: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
})

export const AirulesConfigPackSchema = z.object({
  name: z.string().optional(),
  source: z.string().min(1),
  profile: z.string().optional(),
  agents: z.array(AgentNameSchema).optional(),
  variables: z.record(z.unknown()).optional(),
})

export const AirulesConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  packs: z.array(AirulesConfigPackSchema),

  install: z
    .object({
      defaultPlacement: PlacementSchema.optional(),
      conflict: z.enum(['warn', 'error', 'stage', 'overwrite']).optional(),
    })
    .optional(),

  security: z
    .object({
      trustedSources: z.array(z.string()).optional(),
      allowScripts: z.boolean().optional(),
      requirePinnedVersion: z.boolean().optional(),
    })
    .optional(),
})

export const AirulesResolvedSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('local'),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal('github'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    path: z.string(),
    ref: z.string().optional(),
    commit: z.string().optional(),
  }),
  z.object({
    type: z.literal('npm'),
    packageName: z.string().min(1),
    version: z.string().optional(),
  }),
])

export const AirulesLockPackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  resolved: AirulesResolvedSourceSchema,
  profile: z.string().optional(),
  agents: z.array(AgentNameSchema).optional(),
  hash: z.string().min(1),
})

export const AirulesLockInstallFileSchema = z.object({
  target: z.string().min(1),
  contentHash: z.string().min(1),
})

export const AirulesLockInstallSchema = z.object({
  pack: z.string().min(1),
  installId: z.string().min(1),
  agent: AgentNameSchema,
  target: z.string().min(1),
  mode: InstallModeSchema,
  merge: MergeStrategySchema.optional(),
  modules: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  files: z.array(AirulesLockInstallFileSchema).optional(),
  contentHash: z.string().min(1),
  managedBlockId: z.string().optional(),
})

export const AirulesLockfileSchema = z.object({
  lockfileVersion: z.literal(1),
  generatedAt: z.string().min(1),
  airulesVersion: z.string().min(1),
  packs: z.array(AirulesLockPackSchema),
  installs: z.array(AirulesLockInstallSchema),
})
