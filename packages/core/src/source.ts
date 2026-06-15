import type { AirulesResolvedSource } from '@baicie/airules-schema'
import type { ResolvedGitHubPackSource } from './github-source'
import type { ResolvedNpmPackSource } from './npm-source'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isGitHubSource, resolveGitHubPackSource } from './github-source'
import { isNpmSource, resolveNpmPackSource } from './npm-source'
import {
  assertAgentMdSnippetSource,
  isAgentMdSourceLike,
  normalizePackSourceInput,
} from './source-spec'

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

  if (isAgentMdSourceLike(localPath)) {
    assertAgentMdSnippetSource(localPath)
    const snippetSource = localPath.endsWith('.md')
      ? localPath
      : `${localPath}.md`
    const root = isAbsolute(snippetSource)
      ? snippetSource
      : resolve(cwd, snippetSource)
    return {
      source,
      root,
      resolved: {
        type: 'local',
        path: root,
      },
    }
  }

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
