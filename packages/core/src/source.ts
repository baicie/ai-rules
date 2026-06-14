import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export interface ResolvedLocalPackSource {
  source: string
  root: string
  resolved: AirulesResolvedSource
}

export function resolveLocalPackSource(
  source: string,
  cwd = process.cwd(),
): ResolvedLocalPackSource {
  if (source.startsWith('github:')) {
    throw new Error('github source is not supported in Phase 1.')
  }

  if (source.startsWith('npm:')) {
    throw new Error('npm source is not supported in Phase 1.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported in Phase 1.')
  }

  const normalizedSource = source.startsWith('local:')
    ? source.slice('local:'.length)
    : source

  const localPath = normalizedSource.startsWith('file://')
    ? fileURLToPath(normalizedSource)
    : normalizedSource

  const root = isAbsolute(localPath) ? localPath : resolve(cwd, localPath)

  return {
    source,
    root,
    resolved: {
      type: 'local',
      path: root,
    },
  }
}
