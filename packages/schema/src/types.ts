export type BuiltinAgentName =
  | 'codex'
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'generic'
  | 'skill'

export type AgentName = BuiltinAgentName | (string & {})

export type InstallMode = 'modules' | 'template' | 'file' | 'directory'

export type MergeStrategy =
  | 'managed-block'
  | 'overwrite-managed'
  | 'skip-if-exists'
  | 'manual'

export type Placement =
  | {
      type: 'append'
    }
  | {
      type: 'prepend'
    }
  | {
      type: 'after-heading'
      heading: string
      fallback?: 'append' | 'prepend' | 'error'
    }
  | {
      type: 'before-heading'
      heading: string
      fallback?: 'append' | 'prepend' | 'error'
    }
  | {
      type: 'replace-file'
    }

export interface AirulesProfile {
  description?: string
  extends?: string
  installs?: string[]
  variables?: Record<string, unknown>
}

export interface AirulesInstall {
  id: string
  agent: AgentName
  target: string
  mode: InstallMode

  placement?: Placement
  merge?: MergeStrategy

  concat?: string[]
  blocks?: string[]

  template?: string
  from?: string
}

export interface AirulesPack {
  $schema?: string
  name: string
  version: string
  description?: string
  license?: string
  keywords?: string[]

  engines?: {
    airules?: string
  }

  profiles?: Record<string, AirulesProfile>

  modules?: Record<string, string>
  blocks?: Record<string, string>

  installs: AirulesInstall[]

  detect?: {
    files?: string[]
    packageJson?: {
      dependencies?: string[]
      devDependencies?: string[]
    }
  }
}

export interface AirulesRegistryRef {
  name?: string
  source: string
}

export interface AirulesRegistryPack {
  name: string
  source: string
  version?: string
  description?: string
  tags?: string[]
  aliases?: string[]
  deprecated?: boolean | string
  homepage?: string
}

export interface AirulesRegistry {
  $schema?: string
  name?: string
  version?: string
  description?: string
  defaultPack?: string
  packs: AirulesRegistryPack[]
}

export interface AirulesConfigPack {
  name?: string
  source: string
  profile?: string
  agents?: AgentName[]
  variables?: Record<string, unknown>
}

export interface AirulesConfigInstallOptions {
  defaultPlacement?: Placement
  conflict?: 'warn' | 'error' | 'stage' | 'overwrite'
}

export interface AirulesConfigSecurityOptions {
  trustedSources?: string[]
  allowScripts?: boolean
  requirePinnedVersion?: boolean
}

export interface AirulesConfig {
  $schema?: string
  version: 1
  registries?: AirulesRegistryRef[]
  packs: AirulesConfigPack[]
  install?: AirulesConfigInstallOptions
  security?: AirulesConfigSecurityOptions
}

/**
 * User-facing config accepted by defineConfig().
 * version defaults to 1, packs defaults to [].
 * registries/install/security are only needed when overriding defaults.
 */
export interface AirulesUserConfig {
  $schema?: string
  version?: 1
  registries?: AirulesRegistryRef[]
  packs?: AirulesConfigPack[]
  install?: AirulesConfigInstallOptions
  security?: AirulesConfigSecurityOptions
}

export type AirulesResolvedSource =
  | {
      type: 'local'
      path: string
    }
  | {
      type: 'github'
      owner: string
      repo: string
      path: string
      ref?: string
      commit?: string
    }
  | {
      type: 'npm'
      packageName: string
      version?: string
    }

export interface AirulesLockPack {
  name: string
  version: string
  source: string
  resolved: AirulesResolvedSource
  profile?: string
  agents?: AgentName[]
  hash: string
}

export interface AirulesLockInstallFile {
  target: string
  contentHash: string
}

export interface AirulesLockInstall {
  pack: string
  installId: string
  agent: AgentName
  target: string
  mode: InstallMode
  merge?: MergeStrategy
  modules?: string[]
  blocks?: string[]
  files?: AirulesLockInstallFile[]
  contentHash: string
  managedBlockId?: string
}

export interface AirulesLockfile {
  lockfileVersion: 1
  generatedAt: string
  airulesVersion: string
  packs: AirulesLockPack[]
  installs: AirulesLockInstall[]
}
