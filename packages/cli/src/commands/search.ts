import type { AirulesConfig } from '@baicie/airules-schema'
import { loadAirulesConfigSync, searchRegistries } from '@baicie/airules-core'

export interface SearchCommandOptions {
  cwd: string
  query?: string
  registry?: string
}

export async function runSearchCommand(
  options: SearchCommandOptions,
): Promise<void> {
  const config = loadConfigOrUndefined(options.cwd)
  const results = await searchRegistries({
    cwd: options.cwd,
    query: options.query,
    config,
    registrySource: options.registry,
  })

  if (results.length === 0) {
    console.info('No airules packs found.')
    return
  }

  console.info('airules search')

  for (const result of results) {
    const pack = result.pack
    const deprecated =
      pack.deprecated !== undefined
        ? ` deprecated=${String(pack.deprecated)}`
        : ''

    console.info(
      `- ${pack.name}${pack.version ? `@${pack.version}` : ''}${deprecated}`,
    )
    console.info(`  source: ${pack.source}`)

    if (pack.description) {
      console.info(`  description: ${pack.description}`)
    }

    if (pack.tags !== undefined && pack.tags.length > 0) {
      console.info(`  tags: ${pack.tags.join(', ')}`)
    }

    if (pack.aliases !== undefined && pack.aliases.length > 0) {
      console.info(`  aliases: ${pack.aliases.join(', ')}`)
    }

    console.info(`  registry: ${result.registry}`)
  }
}

function loadConfigOrUndefined(cwd: string): AirulesConfig | undefined {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return undefined
  }
}
