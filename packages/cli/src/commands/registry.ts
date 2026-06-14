import type { AirulesConfig } from '@baicie/airules-schema'
import {
  loadAirulesConfigSync,
  loadConfiguredRegistries,
} from '@baicie/airules-core'

export interface RegistryListCommandOptions {
  cwd: string
  registry?: string
}

export async function runRegistryListCommand(
  options: RegistryListCommandOptions,
): Promise<void> {
  const config = loadConfigOrUndefined(options.cwd)
  const registries = await loadConfiguredRegistries({
    cwd: options.cwd,
    config,
    registrySource: options.registry,
  })

  console.info('airules registries')

  for (const item of registries) {
    console.info(`- ${item.registry.name ?? item.ref.name ?? 'registry'}`)
    console.info(`  source: ${item.ref.source}`)
    if (item.registry.version) {
      console.info(`  version: ${item.registry.version}`)
    }
    console.info(`  packs: ${item.registry.packs.length}`)
  }
}

function loadConfigOrUndefined(cwd: string): AirulesConfig | undefined {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return undefined
  }
}
