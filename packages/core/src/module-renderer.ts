import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RenderModulesOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
}

export interface RenderedModules {
  moduleIds: string[]
  content: string
}

export function renderModules(options: RenderModulesOptions): RenderedModules {
  if (options.install.mode !== 'modules') {
    throw new Error(
      `Install "${options.install.id}" uses mode "${options.install.mode}", but Phase 1 only supports modules mode.`,
    )
  }

  const moduleIds =
    options.install.concat !== undefined ? options.install.concat : []

  if (moduleIds.length === 0) {
    throw new Error(
      `Install "${options.install.id}" requires non-empty concat.`,
    )
  }

  const modules = options.pack.modules

  if (!modules) {
    throw new Error(`Pack "${options.pack.name}" does not define modules.`)
  }

  const parts: string[] = []

  for (const moduleId of moduleIds) {
    const modulePath = modules[moduleId]

    if (!modulePath) {
      throw new Error(
        `Install "${options.install.id}" references missing module "${moduleId}".`,
      )
    }

    const absoluteModulePath = join(options.packRoot, modulePath)

    if (!existsSync(absoluteModulePath)) {
      throw new Error(
        `Module "${moduleId}" not found at ${absoluteModulePath}.`,
      )
    }

    const content = readFileSync(absoluteModulePath, 'utf8').trim()

    if (content.length > 0) {
      parts.push(content)
    }
  }

  return {
    moduleIds,
    content: `${parts.join('\n\n')}\n`,
  }
}
