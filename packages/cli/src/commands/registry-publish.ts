import { publishPackToRegistry } from '@baicie/airules-core'

export interface RegistryPublishCommandOptions {
  cwd: string
  packPath: string
  registry: string
  source: string
  alias?: string
  tag?: string
  description?: string
  homepage?: string
  deprecated?: string | boolean
}

export async function runRegistryPublishCommand(
  options: RegistryPublishCommandOptions,
): Promise<void> {
  const result = publishPackToRegistry({
    cwd: options.cwd,
    packPath: options.packPath,
    registryPath: options.registry,
    source: options.source,
    aliases: parseList(options.alias),
    tags: parseList(options.tag),
    description: options.description,
    homepage: options.homepage,
    deprecated: options.deprecated,
  })

  console.info('airules registry publish')
  console.info(`- action: ${result.action}`)
  console.info(`- registry: ${result.registryPath}`)
  console.info(`- pack: ${result.pack.name}`)
  console.info(`- source: ${result.pack.source}`)
}

function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}
