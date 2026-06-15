import type { AirulesConfig, AirulesPack, AirulesUserConfig } from './types'
import { createDefaultAirulesConfig } from './defaults'

export function defineConfig<T extends AirulesUserConfig>(config: T): T {
  return config
}

export function defineAirulesConfig<T extends AirulesUserConfig>(config: T): T {
  return config
}

export function definePack<T extends AirulesPack>(pack: T): T {
  return pack
}

export function defineAirulesPack<T extends AirulesPack>(pack: T): T {
  return pack
}

export function createDefaultConfig(): AirulesConfig {
  return createDefaultAirulesConfig()
}
