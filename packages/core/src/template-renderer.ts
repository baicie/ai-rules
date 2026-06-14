import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { readTextFile, safeResolveInside } from './path-utils'

export interface RenderTemplateOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
  variables?: Record<string, unknown>
}

export interface RenderTemplateResult {
  content: string
  blockIds: string[]
}

export function renderTemplate(
  options: RenderTemplateOptions,
): RenderTemplateResult {
  if (options.install.mode !== 'template') {
    throw new Error(
      `Install "${options.install.id}" uses mode "${options.install.mode}", expected template.`,
    )
  }

  if (!options.install.template) {
    throw new Error(`Install "${options.install.id}" requires template.`)
  }

  const templatePath = safeResolveInside(
    options.packRoot,
    options.install.template,
    'template',
  )

  const template = readTextFile(templatePath)
  const blockIds = resolveBlockIds(template, options.install.blocks)
  const blocks = readBlocks({
    pack: options.pack,
    packRoot: options.packRoot,
    blockIds,
  })

  const content = renderTemplateString(template, {
    blocks,
    variables: options.variables ?? {},
  })

  return {
    content: ensureTrailingNewline(content),
    blockIds,
  }
}

export function renderTemplateString(
  template: string,
  options: {
    blocks: Record<string, string>
    variables: Record<string, unknown>
  },
): string {
  let output = template

  output = renderIfBlocks(output, options.variables)

  output = output.replace(
    /\{\{\s*block\s+["']([^"']+)["']\s*\}\}/g,
    (_, blockId: string) => {
      return options.blocks[blockId] ?? ''
    },
  )

  output = output.replace(
    /\{\{\s*block:([\w.-]+)\s*\}\}/g,
    (_, blockId: string) => {
      return options.blocks[blockId] ?? ''
    },
  )

  output = output.replace(
    /\{\{\s*([a-z_][\w.-]*)\s*\}\}/gi,
    (_, variableName: string) => {
      const value = getVariableValue(options.variables, variableName)
      if (value === undefined || value === null) {
        return ''
      }
      return String(value)
    },
  )

  return output
}

function renderIfBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if\s+([a-zA-Z_][\w.-]*)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, variableName: string, body: string) => {
      return isTruthy(getVariableValue(variables, variableName)) ? body : ''
    },
  )
}

function resolveBlockIds(
  template: string,
  explicitBlockIds: string[] | undefined,
): string[] {
  const result = new Set<string>()

  for (const blockId of explicitBlockIds ?? []) {
    result.add(blockId)
  }

  for (const match of template.matchAll(
    /\{\{\s*block\s+["']([^"']+)["']\s*\}\}/g,
  )) {
    const blockId = match[1]
    if (blockId) {
      result.add(blockId)
    }
  }

  for (const match of template.matchAll(/\{\{\s*block:([\w.-]+)\s*\}\}/g)) {
    const blockId = match[1]
    if (blockId) {
      result.add(blockId)
    }
  }

  return Array.from(result)
}

function readBlocks(options: {
  pack: AirulesPack
  packRoot: string
  blockIds: string[]
}): Record<string, string> {
  const blocks = options.pack.blocks

  if (!blocks && options.blockIds.length > 0) {
    throw new Error(`Pack "${options.pack.name}" does not define blocks.`)
  }

  const result: Record<string, string> = {}

  for (const blockId of options.blockIds) {
    const blockPath = blocks?.[blockId]

    if (!blockPath) {
      throw new Error(
        `Template references missing block "${blockId}" in pack "${options.pack.name}".`,
      )
    }

    const absoluteBlockPath = safeResolveInside(
      options.packRoot,
      blockPath,
      'block',
    )

    result[blockId] = readTextFile(absoluteBlockPath).trim()
  }

  return result
}

function getVariableValue(
  variables: Record<string, unknown>,
  variableName: string,
): unknown {
  const parts = variableName.split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (
      current &&
      typeof current === 'object' &&
      Object.hasOwn(current, part)
    ) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

function isTruthy(value: unknown): boolean {
  if (value === false || value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.length > 0
  }

  return Boolean(value)
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`
}
