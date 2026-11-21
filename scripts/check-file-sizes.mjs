#!/usr/bin/env node
// Rejects files that are too big for their type, with a ratchet baseline for
// files that were already too big when the check was introduced.
//
//   node scripts/check-file-sizes.mjs             check tracked files in the working tree
//   node scripts/check-file-sizes.mjs --update    rewrite the baseline from the working tree
//   node scripts/check-file-sizes.mjs --pre-push  check what `git push` is about to send
//                                                 (reads the pre-push hook's stdin)
//
// A baselined file may stay at or below its recorded size but may not grow.
// When a baselined file shrinks or disappears, the check still passes and asks
// you to run `pnpm size:update` to lock in the improvement.

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import process from 'node:process'

const KiB = 1024
const MiB = 1024 * KiB

// Per-type limits. Extensions are matched lowercase, without the dot.
const LIMITS = [
  ['source code', 100 * KiB, 'js mjs cjs ts mts cts jsx tsx vue svelte css scss sass less styl html htm sh bash zsh ps1 py rb go rs'],
  ['vector image', 100 * KiB, 'svg'],
  ['docs / text', 256 * KiB, 'md mdx markdown txt rst adoc'],
  ['data / config', 256 * KiB, 'json jsonc json5 yaml yml toml xml csv tsv ini snap'],
  ['raster image', 500 * KiB, 'png jpg jpeg gif webp avif bmp ico tif tiff'],
  ['font', 500 * KiB, 'woff woff2 ttf otf eot'],
  ['archive', 1 * MiB, 'zip gz tgz bz2 xz zst 7z tar jar'],
  ['document', 2 * MiB, 'pdf pptx docx xlsx key'],
  ['audio', 2 * MiB, 'mp3 wav ogg oga flac m4a aac'],
  ['webassembly', 2 * MiB, 'wasm'],
  ['video', 5 * MiB, 'mp4 webm mov m4v avi mkv'],
].map(([name, max, ext]) => ({
  name,
  max,
  ext: ext.split(' '),
}))
const DEFAULT_LIMIT = { name: 'other', max: 512 * KiB }

// Generated files that legitimately grow with dependency changes.
const EXEMPT_BASENAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
])

const BASELINE_FILE = 'scripts/file-size-baseline.json'
const ZERO_SHA = /^0+$/

const LIMIT_BY_EXT = new Map(LIMITS.flatMap(l => l.ext.map(e => [e, l])))

function git(args, input) {
  // stderr is captured (not printed); it is included in the thrown error on failure.
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * MiB,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const ROOT = git(['rev-parse', '--show-toplevel']).trim()

function limitFor(path) {
  if (EXEMPT_BASENAMES.has(basename(path)))
    return null
  return LIMIT_BY_EXT.get(extname(path).slice(1).toLowerCase()) ?? DEFAULT_LIMIT
}

function fmt(bytes) {
  if (bytes >= MiB)
    return `${(bytes / MiB).toFixed(2)} MiB`
  if (bytes >= KiB)
    return `${(bytes / KiB).toFixed(1)} KiB`
  return `${bytes} B`
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(join(ROOT, BASELINE_FILE), 'utf8')).files ?? {}
  }
  catch (e) {
    if (e.code === 'ENOENT')
      return {}
    throw e
  }
}

/** Tracked files in the working tree, as [{ path, size }]. */
function workingTreeFiles() {
  const out = []
  for (const path of git(['-C', ROOT, 'ls-files', '-z']).split('\0').filter(Boolean)) {
    try {
      const st = statSync(join(ROOT, path))
      if (st.isFile())
        out.push({ path, size: st.size })
    }
    catch {} // deleted but not yet staged
  }
  return out
}

/** Blobs in a commit's tree, as [{ path, size, sha }]. */
function treeFiles(rev) {
  const out = []
  for (const line of git([
    '-C',
    ROOT,
    'ls-tree',
    '-r',
    '-l',
    '-z',
    rev,
  ]).split('\0').filter(Boolean)) {
    // <mode> SP <type> SP <sha> SP+ <size> TAB <path>
    const tab = line.indexOf('\t')
    const [, type, sha, size] = line.slice(0, tab).trim().split(/\s+/)
    if (type === 'blob') {
      out.push({
        path: line.slice(tab + 1),
        size: Number(size),
        sha,
      })
    }
  }
  return out
}

/** Blobs introduced by the commits in a rev-list range, as [{ path, size, sha }]. */
function newBlobs(revListArgs) {
  const objects = git([
    '-C',
    ROOT,
    'rev-list',
    '--objects',
    ...revListArgs,
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const sp = line.indexOf(' ')
      return sp === -1
        ? { sha: line, path: '' }
        : {
            sha: line.slice(0, sp),
            path: line.slice(sp + 1),
          }
    })
  if (!objects.length)
    return []
  const info = git([
    '-C',
    ROOT,
    'cat-file',
    '--batch-check=%(objectname) %(objecttype) %(objectsize)',
  ], `${objects.map(o => o.sha).join('\n')}\n`)
    .split('\n')
    .filter(Boolean)
  return objects.flatMap((o, i) => {
    const [, type, size] = info[i].split(' ')
    return type === 'blob' && o.path
      ? [
          {
            path: o.path,
            size: Number(size),
            sha: o.sha,
          },
        ]
      : []
  })
}

/** Returns violations for a list of files against limits and baseline. */
function check(files, baseline) {
  const violations = []
  for (const { path, size, where } of files) {
    const limit = limitFor(path)
    if (!limit)
      continue
    const allowed = baseline[path] ?? limit.max
    if (size > allowed) {
      violations.push({
        path,
        size,
        where,
        reason: path in baseline
          ? `grew ${size - allowed} B past its baseline of ${allowed} B`
          : `exceeds the ${limit.name} limit of ${fmt(limit.max)}`,
      })
    }
  }
  return violations
}

function looseBaselineEntries(files, baseline) {
  const sizes = new Map(files.map(f => [f.path, f.size]))
  const loose = []
  for (const [path, allowed] of Object.entries(baseline)) {
    const size = sizes.get(path)
    const limit = limitFor(path)
    if (size === undefined)
      loose.push(`${path} (no longer exists)`)
    else if (!limit || size <= limit.max)
      loose.push(`${path} (now within limit)`)
    else if (size < allowed)
      loose.push(`${path} (${fmt(allowed)} → ${fmt(size)})`)
  }
  return loose
}

function report(violations) {
  if (!violations.length)
    return
  console.error(`\n✖ ${violations.length} file(s) are too big:\n`)
  for (const v of violations) {
    console.error(`  ${v.path}  ${fmt(v.size)} — ${v.reason}${v.where
      ? ` [${v.where}]`
      : ''}`)
  }
  console.error(`
Shrink or remove these files (and rewrite history if a big file was committed
and later deleted), or move them out of the repo. If a file really must be this
big, run \`pnpm size:update\` and commit ${BASELINE_FILE} so the
exception is visible in review.
`)
}

function warnLoose(loose) {
  if (!loose.length)
    return
  console.warn(`\nℹ The size baseline can be tightened for ${loose.length} file(s):`)
  for (const l of loose)
    console.warn(`  ${l}`)
  console.warn('Run `pnpm size:update` and commit the result to lock in the improvement.\n')
}

function update() {
  const files = {}
  for (const { path, size } of workingTreeFiles().sort((a, b) => a.path.localeCompare(b.path))) {
    const limit = limitFor(path)
    if (limit && size > limit.max)
      files[path] = size
  }
  const doc = {
    $comment: 'Ratchet for files that exceed the limits in scripts/check-file-sizes.mjs. Sizes are in bytes and may only go down. Regenerate with `pnpm size:update`.',
    files,
  }
  writeFileSync(join(ROOT, BASELINE_FILE), `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(files).length} oversized file(s) to ${BASELINE_FILE}.`)
}

function checkWorkingTree() {
  const baseline = loadBaseline()
  const files = workingTreeFiles()
  const violations = check(files, baseline)
  report(violations)
  warnLoose(looseBaselineEntries(files, baseline))
  if (!violations.length)
    console.log(`✔ ${files.length} tracked files are within size limits.`)
  return violations.length ? 1 : 0
}

function checkPrePush() {
  const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  const violations = []
  for (const line of lines) {
    const [localRef, localSha, , remoteSha] = line.split(' ')
    if (ZERO_SHA.test(localSha))
      continue // deleting a remote ref
    // Use the baseline as of the commit being pushed, so a baseline change
    // travels with the commit that needs it.
    let baseline = {}
    try {
      baseline = JSON.parse(git([
        '-C',
        ROOT,
        'show',
        `${localSha}:${BASELINE_FILE}`,
      ])).files ?? {}
    }
    catch {}

    const tip = treeFiles(localSha)
    const atTip = new Set(tip.map(f => f.sha))
    const range = ZERO_SHA.test(remoteSha)
      ? [localSha, '--not', '--remotes']
      : [localSha, `^${remoteSha}`]
    let history = []
    try {
      history = newBlobs(range).filter(b => !atTip.has(b.sha))
    }
    catch {
      // remote sha unknown locally (e.g. force-push over unfetched work): tip check only
    }
    violations.push(
      ...check(tip, baseline),
      ...check(history.map(b => ({ ...b, where: `in history of ${localRef}, deleted before tip` })), baseline),
    )
  }
  const unique = [
    ...new Map(violations.map(v => [`${v.path}\0${v.size}\0${v.where ?? ''}`, v])).values(),
  ]
  report(unique)
  return unique.length ? 1 : 0
}

const args = new Set(process.argv.slice(2))
if (args.has('--update'))
  update()
else if (args.has('--pre-push'))
  process.exitCode = checkPrePush()
else
  process.exitCode = checkWorkingTree()
