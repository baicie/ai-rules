import type { AirulesPack } from '@baicie/airules-schema'
import type { ResolvedPackSource } from './source'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { AirulesPackSchema } from '@baicie/airules-schema'

export interface LoadedAirulesPack {
  root: string
  packFilePath: string
  pack: AirulesPack
  rawContent: string
}

export function loadLocalPack(source: ResolvedPackSource): LoadedAirulesPack {
  const sourcePath = source.root
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
