import type { AirulesResolvedSource } from '@baicie/airules-schema'
import type { ResolvedGitHubPackSource } from './github-source'
import type { ResolvedNpmPackSource } from './npm-source'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isGitHubSource, resolveGitHubPackSource } from './github-source'
import { isNpmSource, resolveNpmPackSource } from './npm-source'
import { normalizePackSourceInput } from './source-spec'

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
  | ResolvedNpmPackSource

export async function resolvePackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedAnyPackSource> {
  const normalizedSource = normalizePackSourceInput(source)

  if (isGitHubSource(normalizedSource)) {
    return resolveGitHubPackSource(normalizedSource, cwd)
  }

  if (isNpmSource(normalizedSource)) {
    return resolveNpmPackSource(normalizedSource, cwd)
  }

  return resolveLocalPackSource(normalizedSource, cwd)
}

export function resolveLocalPackSource(
  source: string,
  cwd = process.cwd(),
): ResolvedLocalPackSource {
  if (source.startsWith('github:')) {
    throw new Error('Use resolvePackSource() for github sources.')
  }

  if (source.startsWith('npm:')) {
    throw new Error('Use resolvePackSource() for npm sources.')
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    throw new Error('http source is not supported as direct pack source.')
  }

  const normalizedSource = source.startsWith('local:')
    ? source.slice('local:'.length)
    : source

  const localPath = normalizedSource.startsWith('file://')
    ? fileURLToPath(normalizedSource)
    : normalizedSource

  const resolvedPath = isAbsolute(localPath)
    ? localPath
    : resolve(cwd, localPath)
  const root =
    !existsSync(resolvedPath) && existsSync(`${resolvedPath}.md`)
      ? `${resolvedPath}.md`
      : resolvedPath

  return {
    source,
    root,
    resolved: {
      type: 'local',
      path: root,
    },
  }
}
