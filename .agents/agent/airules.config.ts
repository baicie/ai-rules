// airules config (v1)
//
// This file is loaded by airules. The default export is validated against
// the airules config schema. You can optionally import the typed helper
// from "@baicie/airules-schema" once it is installed in your project.

export default {
  version: 1,
  registries: [
    {
      name: 'default',
      source: 'github:baicie/ai-rules/registry.json#main',
    },
  ],
  packs: [],
  install: {
    conflict: 'warn',
  },
  security: {
    trustedSources: ['github:baicie/ai-rules'],
    allowScripts: false,
    requirePinnedVersion: false,
  },
}
