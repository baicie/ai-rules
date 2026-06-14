import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AIRULES_AGENT_DIR,
  AIRULES_CACHE_DIRNAME,
  AIRULES_LOCK_FILENAME,
  AIRULES_STAGED_DIRNAME,
  AIRULES_STATE_FILENAME,
} from '@baicie/airules-core'

export interface InitCommandOptions {
  cwd: string
  force?: boolean
}

export async function runInitCommand(
  options: InitCommandOptions,
): Promise<void> {
  const agentDir = join(options.cwd, AIRULES_AGENT_DIR)
  const cacheDir = join(agentDir, AIRULES_CACHE_DIRNAME)
  const stagedDir = join(agentDir, AIRULES_STAGED_DIRNAME)

  mkdirSync(agentDir, {
    recursive: true,
  })

  mkdirSync(cacheDir, {
    recursive: true,
  })

  mkdirSync(stagedDir, {
    recursive: true,
  })

  writeFileIfAllowed(
    join(agentDir, 'airules.config.ts'),
    createDefaultConfig(),
    options.force,
  )

  writeFileIfAllowed(
    join(agentDir, AIRULES_LOCK_FILENAME),
    createEmptyLockfile(),
    options.force,
  )

  writeFileIfAllowed(
    join(agentDir, AIRULES_STATE_FILENAME),
    JSON.stringify(
      {
        version: 1,
        initializedAt: new Date().toISOString(),
      },
      null,
      2,
    ).concat('\n'),
    options.force,
  )

  console.info(`Initialized airules under ${AIRULES_AGENT_DIR}`)
}

function writeFileIfAllowed(
  filePath: string,
  content: string,
  force = false,
): void {
  if (existsSync(filePath) && !force) {
    const existing = readFileSync(filePath, 'utf8')
    if (existing.length > 0) {
      console.info(`Skipped existing file: ${filePath}`)
      return
    }
  }

  writeFileSync(filePath, content)
  console.info(`Created file: ${filePath}`)
}

function createDefaultConfig(): string {
  return `// airules config (v1)
//
// This file is loaded by airules. The default export is validated against
// the airules config schema. You can optionally import the typed helper
// from "@baicie/airules-schema" once it is installed in your project.

export default {
  version: 1,
  packs: [],
  install: {
    conflict: "warn"
  },
  security: {
    trustedSources: [],
    allowScripts: false,
    requirePinnedVersion: false
  }
};
`
}

function createEmptyLockfile(): string {
  return JSON.stringify(
    {
      lockfileVersion: 1,
      generatedAt: new Date().toISOString(),
      airulesVersion: '0.0.0',
      packs: [],
      installs: [],
    },
    null,
    2,
  ).concat('\n')
}
