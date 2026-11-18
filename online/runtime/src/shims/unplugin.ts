// Only the transform factory is used in the sandbox, not bundler integration.
export function createUnplugin(factory: (...args: any[]) => any) {
  return { vite: factory, raw: factory }
}

export function createVitePlugin(factory: (...args: any[]) => any) {
  return factory
}
