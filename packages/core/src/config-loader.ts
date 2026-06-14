import type { AirulesConfig } from '@baicie/airules-schema'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { AirulesConfigSchema } from '@baicie/airules-schema'
import { createJiti } from 'jiti'
import {
  AIRULES_AGENT_DIR,
  AIRULES_CONFIG_FILENAMES,
  AIRULES_LOCK_FILENAME,
} from './constants'

export interface ResolvedAirulesConfigPath {
  path: string
  filename: string
}

export function getAirulesAgentDir(cwd = process.cwd()): string {
  return join(cwd, AIRULES_AGENT_DIR)
}

export function getAirulesLockPath(cwd = process.cwd()): string {
  return join(getAirulesAgentDir(cwd), AIRULES_LOCK_FILENAME)
}

export function resolveAirulesConfigPath(
  cwd = process.cwd(),
): ResolvedAirulesConfigPath | null {
  const dir = getAirulesAgentDir(cwd)

  for (const filename of AIRULES_CONFIG_FILENAMES) {
    const configPath = join(dir, filename)
    if (existsSync(configPath)) {
      return {
        path: configPath,
        filename,
      }
    }
  }

  return null
}

export async function loadAirulesConfig(
  cwd = process.cwd(),
): Promise<AirulesConfig> {
  const resolvedConfig = resolveAirulesConfigPath(cwd)

  if (!resolvedConfig) {
    throw new Error(
      `Cannot find airules config under ${AIRULES_AGENT_DIR}. Run airules init first.`,
    )
  }

  const rawConfig = await loadConfigFile(resolvedConfig.path)

  return AirulesConfigSchema.parse(rawConfig)
}

async function loadConfigFile(configPath: string): Promise<unknown> {
  if (configPath.endsWith('.json')) {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  }

  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  })

  const loaded = await jiti.import(pathToFileURL(resolve(configPath)).href, {
    default: true,
  })

  return unwrapDefault(loaded)
}

function unwrapDefault(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'default' in value &&
    Object.keys(value).length === 1
  ) {
    return (value as { default: unknown }).default
  }

  return value
}
