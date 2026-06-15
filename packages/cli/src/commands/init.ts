import { AIRULES_AGENT_DIR, ensureAirulesProject } from '@baicie/airules-core'

export interface InitCommandOptions {
  cwd: string
  force?: boolean
  noSkill?: boolean
}

export async function runInitCommand(
  options: InitCommandOptions,
): Promise<void> {
  const result = ensureAirulesProject({
    cwd: options.cwd,
    force: options.force === true,
    writeConfig: true,
    writeLockfile: true,
    writeSelfSkill: options.noSkill !== true,
  })

  for (const file of result.created) {
    console.info(`Created file: ${file}`)
  }

  for (const file of result.skipped) {
    console.info(`Skipped existing file: ${file}`)
  }

  console.info(`Initialized airules under ${AIRULES_AGENT_DIR}`)
}
