import type { AirulesPack } from '@baicie/airules-schema'
import type { ResolvedPackSource } from './source'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { AirulesPackSchema } from '@baicie/airules-schema'

export interface LoadedAirulesPack {
  root: string
  packFilePath: string
  pack: AirulesPack
  rawContent: string
}

export function loadLocalPack(source: ResolvedPackSource): LoadedAirulesPack {
  const sourcePath = source.root
  if (extname(sourcePath) === '.md') {
    return loadAgentMdSnippet(sourcePath)
  }

  const packFilePath = sourcePath.endsWith('.json')
    ? sourcePath
    : join(sourcePath, 'airules.pack.json')

  if (!existsSync(packFilePath)) {
    throw new Error(`Cannot find airules.pack.json at ${packFilePath}.`)
  }

  const rawContent = readFileSync(packFilePath, 'utf8')
  const rawPack = JSON.parse(rawContent)
  const pack = AirulesPackSchema.parse(rawPack)
  const root = dirname(resolve(packFilePath))

  return {
    root,
    packFilePath,
    pack,
    rawContent,
  }
}

function loadAgentMdSnippet(sourcePath: string): LoadedAirulesPack {
  if (!existsSync(sourcePath)) {
    throw new Error(`Cannot find AgentMD snippet at ${sourcePath}.`)
  }

  const rawContent = readFileSync(sourcePath, 'utf8')
  const fileName = basename(sourcePath)
  const slug = createSnippetSlug(fileName.slice(0, -'.md'.length))
  const pack: AirulesPack = {
    name: `@local/agentmd-${slug}`,
    version: '0.0.0',
    description: `AgentMD snippet from ${fileName}`,
    modules: {
      main: fileName,
    },
    installs: [
      {
        id: 'agentmd',
        agent: 'codex',
        target: 'AGENTS.md',
        mode: 'modules',
        placement: {
          type: 'append',
        },
        concat: ['main'],
        merge: 'managed-block',
      },
    ],
  }

  return {
    root: dirname(resolve(sourcePath)),
    packFilePath: sourcePath,
    pack,
    rawContent,
  }
}

function createSnippetSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug.length > 0 ? slug : 'snippet'
}
