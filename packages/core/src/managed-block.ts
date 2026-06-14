import type { Placement } from '@baicie/airules-schema'
import { sha256 } from './hash'

export interface ManagedBlockMeta {
  pack: string
  install: string
  version: string
  hash?: string
}

export interface ManagedBlockRange {
  start: number
  end: number
}

export function createManagedBlock(
  meta: ManagedBlockMeta,
  content: string,
): string {
  const normalizedContent = normalizeTrailingNewline(content)
  const contentHash = meta.hash ?? sha256(normalizedContent)

  return [
    `<!-- airules:start pack="${meta.pack}" install="${meta.install}" version="${meta.version}" hash="${contentHash}" -->`,
    normalizedContent.trimEnd(),
    `<!-- airules:end pack="${meta.pack}" install="${meta.install}" -->`,
  ].join('\n')
}

export function findManagedBlockRange(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
): ManagedBlockRange | null {
  const startPattern = new RegExp(
    `<!--\\s*airules:start\\s+pack="${escapeRegExp(
      meta.pack,
    )}"\\s+install="${escapeRegExp(meta.install)}"[^>]*-->`,
  )

  const endPattern = new RegExp(
    `<!--\\s*airules:end\\s+pack="${escapeRegExp(
      meta.pack,
    )}"\\s+install="${escapeRegExp(meta.install)}"\\s*-->`,
  )

  const startMatch = startPattern.exec(source)

  if (!startMatch || typeof startMatch.index !== 'number') {
    return null
  }

  const rest = source.slice(startMatch.index + startMatch[0].length)
  const endMatch = endPattern.exec(rest)

  if (!endMatch || typeof endMatch.index !== 'number') {
    return null
  }

  const end =
    startMatch.index +
    startMatch[0].length +
    endMatch.index +
    endMatch[0].length

  return {
    start: startMatch.index,
    end,
  }
}

export function replaceManagedBlock(
  source: string,
  meta: Pick<ManagedBlockMeta, 'pack' | 'install'>,
  nextBlock: string,
): string | null {
  const range = findManagedBlockRange(source, meta)

  if (!range) {
    return null
  }

  return `${source.slice(0, range.start)}${nextBlock}${source.slice(range.end)}`
}

export function upsertManagedBlock(
  source: string,
  meta: ManagedBlockMeta,
  content: string,
  placement: Placement = { type: 'append' },
): string {
  const nextBlock = createManagedBlock(meta, content)
  const replaced = replaceManagedBlock(source, meta, nextBlock)

  if (replaced !== null) {
    return replaced
  }

  return insertByPlacement(source, nextBlock, placement)
}

export function insertByPlacement(
  source: string,
  insertion: string,
  placement: Placement,
): string {
  switch (placement.type) {
    case 'append': {
      return appendBlock(source, insertion)
    }

    case 'prepend': {
      return prependBlock(source, insertion)
    }

    case 'after-heading': {
      const inserted = insertAroundHeading(source, insertion, {
        heading: placement.heading,
        position: 'after',
      })

      if (inserted !== null) {
        return inserted
      }

      return applyFallback(source, insertion, placement.fallback)
    }

    case 'before-heading': {
      const inserted = insertAroundHeading(source, insertion, {
        heading: placement.heading,
        position: 'before',
      })

      if (inserted !== null) {
        return inserted
      }

      return applyFallback(source, insertion, placement.fallback)
    }

    case 'replace-file': {
      return normalizeTrailingNewline(insertion)
    }

    default: {
      throw new Error(`Unsupported placement: ${JSON.stringify(placement)}`)
    }
  }
}

function appendBlock(source: string, insertion: string): string {
  if (!source.trim()) {
    return normalizeTrailingNewline(insertion)
  }

  return `${source.trimEnd()}\n\n${normalizeTrailingNewline(insertion)}`
}

function prependBlock(source: string, insertion: string): string {
  if (!source.trim()) {
    return normalizeTrailingNewline(insertion)
  }

  return `${insertion.trimEnd()}\n\n${source.trimStart()}`
}

function insertAroundHeading(
  source: string,
  insertion: string,
  options: {
    heading: string
    position: 'before' | 'after'
  },
): string | null {
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex(line => line.trim() === options.heading)

  if (index === -1) {
    return null
  }

  if (options.position === 'before') {
    const before = lines.slice(0, index).join('\n').trimEnd()
    const after = lines.slice(index).join('\n').trimStart()

    return [before, insertion.trimEnd(), after]
      .filter(Boolean)
      .join('\n\n')
      .concat('\n')
  }

  const before = lines
    .slice(0, index + 1)
    .join('\n')
    .trimEnd()
  const after = lines
    .slice(index + 1)
    .join('\n')
    .trimStart()

  return [before, insertion.trimEnd(), after]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n')
}

function applyFallback(
  source: string,
  insertion: string,
  fallback: 'append' | 'prepend' | 'error' | undefined,
): string {
  if (!fallback || fallback === 'append') {
    return appendBlock(source, insertion)
  }

  if (fallback === 'prepend') {
    return prependBlock(source, insertion)
  }

  throw new Error('Cannot find placement heading and fallback is error.')
}

function normalizeTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
