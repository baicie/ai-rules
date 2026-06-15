export default {
  packs: [
    {
      name: '@baicie/react-shadcn',
      source: 'github:baicie/ai-rules',
      agents: ['codex'],
    },
  ],
  install: {
    conflict: 'warn',
  },
  security: {
    trustedSources: ['github:baicie/ai-rules'],
    allowScripts: false,
    requirePinnedVersion: false,
  },
}
