import type { AirulesResolvedSource } from '@baicie/airules-schema'
import type { ResolvedGitHubPackSource } from './github-source'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isGitHubSource, resolveGitHubPackSource } from './github-source'

export interface ResolvedPackSource {
  source: string
  root: string
  resolved: AirulesResolvedSource
}

export interface ResolvedLocalPackSource extends ResolvedPackSource {
  resolved: Extract<AirulesResolvedSource, { type: 'local' }>
}

export type ResolvedAnyPackSource =
  | ResolvedLocalPackSource
  | ResolvedGitHubPackSource

export async function resolvePackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedAnyPackSource> {
  if (isGitHubSource(source)) {
    return resolveGitHubPackSource(source, cwd)
  }

  return resolveLocalPackSource(source, cwd)
}

export function resolveLocalPackSource(
  source: string,
  cwd = process.cwd(),
): ResolvedLocalPackSource {
  if (source.startsWith('github:')) {
    throw new Error('Use resolvePackSource() for github sources.')
  }

  if (source.startsWith('npm:')) {
    throw new Error('npm source is not supported in Phase 2.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported in Phase 2.')
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
