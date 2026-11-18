// unplugin-vue-markdown probes Vue's version through require only when no
// explicit version is supplied. Online always supplies the bundled version.
export function createRequire() {
  return () => {
    throw new Error('Node module loading is not available online')
  }
}
