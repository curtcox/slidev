// Filesystem setup directories are deliberately unsupported online. Bundled
// theme transformers can be supplied here without evaluating app-origin code.
export default async function setupTransformers() {
  return {
    pre: [],
    preCodeblock: [],
    postCodeblock: [],
    post: [],
    codeblocks: [],
  }
}
