import type { AirulesConfig } from './types'

export const DEFAULT_AIRULES_REGISTRY_NAME = 'default'

export const DEFAULT_AIRULES_REGISTRY_SOURCE =
  'github:baicie/ai-rules/registry.json#main'

export const DEFAULT_AIRULES_INSTALL_CONFLICT = 'warn'

export const DEFAULT_AIRULES_SECURITY = {
  allowScripts: false,
  requirePinnedVersion: false,
} as const

export function createDefaultAirulesConfig(): AirulesConfig {
  return {
    version: 1,
    packs: [],
  }
}
