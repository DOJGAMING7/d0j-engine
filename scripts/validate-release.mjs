// Step 8 release validation. Runs fully on this bench without a JDK/SDK:
// it verifies shipped bytes, source structure and honesty of live bindings.
// Device-only gates are reported as limits, never marked as passed.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GAME_PACKAGES, SUPPORTED_GAMES, TARGET_BUILD } from '../src/lib/config.js'

const ROOT = resolve(import.meta.dirname, '..')
const ASSETS = join('android', 'app', 'src', 'main', 'assets')
const PUBLIC_ASSETS = join(ASSETS, 'public')

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const readText = path => readFileSync(path, 'utf8')
export const exists = path => existsSync(path)

export function balancedSource(source) {
  const pairs = [['{', '}'], ['(', ')'], ['[', ']']]
  return pairs.every(([open, close]) =>
    (source.split(open).length - 1) === (source.split(close).length - 1))
}

function filesUnder(dir, base = dir) {
  if (!exists(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, base))
    else out.push(relative(base, path).split('\\').join('/'))
  }
  return out.sort()
}

export function validatePackage(root = ROOT) {
  const pkg = JSON.parse(readText(join(root, 'package.json')))
  const gradle = readText(join(root, 'android', 'app', 'build.gradle'))
  const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || ''
  const versionCode = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1] || 0)
  const ok = pkg.version === versionName && versionCode > 0
  return {
    ok,
    detail: ok ? `package ${pkg.version} = gradle ${versionName} (code ${versionCode})`
      : `package ${pkg.version} != gradle ${versionName} / code ${versionCode}`,
    version: pkg.version,
    versionName,
    versionCode
  }
}

export function validateScripts(root = ROOT) {
  const manifestPath = join(root, 'scripts', 'index.json')
  if (!exists(manifestPath)) return { ok: false, detail: 'scripts/index.json missing', items: [] }
  const manifest = JSON.parse(readText(manifestPath))
  const roots = ['scripts', 'public/scripts', 'dist/scripts', join(PUBLIC_ASSETS, 'scripts')]
  const items = (manifest.scripts || []).map(entry => {
    const file = String(entry.file).replace(/^scripts\//, '')
    const copies = roots.map(base => {
      const path = join(root, base, file)
      return { base, path, hash: exists(path) ? sha256(readFileSync(path)) : null }
    })
    const ok = copies.every(copy => copy.hash === entry.hash)
    return { id: entry.id, file: entry.file, expected: entry.hash, copies, ok }
  })
  return {
    ok: items.length > 0 && items.every(item => item.ok),
    detail: items.every(item => item.ok) ? `${items.length} scripts byte-identical in 4 locations`
      : items.filter(item => !item.ok).map(item => `${item.file}: ${item.copies.map(c => `${c.base}=${c.hash || 'missing'}`).join(' ')}`).join(' | '),
    items
  }
}

export function validateWebAssets(root = ROOT) {
  const dist = join(root, 'dist')
  if (!exists(dist)) return { ok: false, detail: 'dist missing — run npm run build', files: 0, mismatches: ['dist'] }
  const files = filesUnder(dist)
  const mismatches = files.filter(rel => {
    const built = join(dist, rel)
    const shipped = join(root, PUBLIC_ASSETS, rel)
    return !exists(shipped) || sha256(readFileSync(shipped)) !== sha256(readFileSync(built))
  })
  return {
    ok: files.length > 0 && mismatches.length === 0,
    detail: mismatches.length ? `stale native assets: ${mismatches.join(', ')}`
      : `${files.length} built files copied to native assets`,
    files: files.length,
    mismatches
  }
}

export function validateJava(root = ROOT) {
  const dirs = [
    join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'd0j', 'engine'),
    join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'd0j', 'engine', 'vm')
  ]
  const required = [
    'D0JNativePlugin.java', 'D0JOverlayService.java', 'D0JLineLayer.java',
    'SystemCallProvider.java', 'VMLifecycleMonitor.java', 'VMActivityInputInjector.java',
    'VMInputProvider.java', 'VMMemoryProvider.java', 'VMProcMemoryReader.java'
  ]
  const sources = []
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.java')) continue
      const path = join(dir, name)
      const text = readText(path)
      sources.push({ name, path, balanced: balancedSource(text) })
    }
  }
  const byName = new Map(sources.map(source => [source.name, source]))
  const missing = required.filter(name => !byName.has(name))
  const unbalanced = sources.filter(source => !source.balanced).map(source => source.name)
  const all = sources.map(source => readText(source.path)).join('\n')
  const accessibility = /AccessibilityService|BIND_ACCESSIBILITY_SERVICE|android\.accessibilityservice/i.test(all)
  const symbols = ['vmInputPath', 'sessionWatch', 'ACTION_UPDATE_LINES', 'inputTap', 'hostActivity']
    .filter(symbol => !all.includes(symbol))
  const ok = missing.length === 0 && unbalanced.length === 0 && !accessibility && symbols.length === 0
  return {
    ok,
    detail: ok ? `${sources.length} Java sources balanced, no accessibility declarations`
      : `missing=${missing.join(',')} unbalanced=${unbalanced.join(',')} accessibility=${accessibility} symbols=${symbols.join(',')}`,
    files: sources.length,
    missing,
    unbalanced,
    accessibility,
    symbols
  }
}

export function validateManifest(root = ROOT) {
  const manifest = readText(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'))
  const required = [
    'SYSTEM_ALERT_WINDOW', '.D0JOverlayService', '.vm.VMDaemonService',
    '.vm.SystemCallProvider', 'android.permission.POST_NOTIFICATIONS'
  ]
  const missing = required.filter(token => !manifest.includes(token))
  for (let i = 0; i < 4; i++) {
    for (const authority of ['vmmem', 'vminput']) {
      const token = `.${authority}.p${i}`
      if (!manifest.includes(token)) missing.push(token)
    }
    if (!manifest.includes(`android:process=":p${i}"`)) missing.push(`:p${i}`)
  }
  const forbidden = /android\.accessibilityservice|BIND_ACCESSIBILITY_SERVICE/i.test(manifest)
  const ok = missing.length === 0 && !forbidden
  return { ok, detail: ok ? 'daemon, 4 child processes, mem/input providers, overlay declared' : `missing=${missing.join(',')} forbidden=${forbidden}`, missing, forbidden }
}

export function validateBindings(root = ROOT) {
  const build = String(TARGET_BUILD).split(' ').pop()
  const path = join(root, ASSETS, 'vm', 'bindings', `8bp-${build}.json`)
  if (!exists(path)) return { ok: false, honest: false, measured: false, detail: `missing ${path}` }
  const data = JSON.parse(readText(path))
  const offsets = Object.entries(data).filter(([key]) => key.endsWith('Offset') || key.endsWith('Stride'))
  const unmeasured = String(data.status).toUpperCase() === 'UNMEASURED'
    && data.usable === false && offsets.every(([, value]) => value === null)
  const matchesTarget = data.packageName === GAME_PACKAGES.eightBallPool
    && data.versionName === TARGET_BUILD.split(' ').pop()
    && Number(data.versionCode) > 0
  const measured = !unmeasured && data.usable === true && offsets.some(([, value]) => value !== null)
  return {
    ok: unmeasured && matchesTarget,
    honest: unmeasured,
    measured,
    detail: unmeasured ? `honest UNMEASURED for ${data.packageName} ${data.versionName} (code ${data.versionCode})`
      : 'bindings file no longer clearly UNMEASURED — verify offsets on device',
    path: relative(root, path),
    data
  }
}

export function validateVersionMatrix(root = ROOT) {
  const runtime = readText(join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'd0j', 'engine', 'vm', 'VMRuntime.java'))
  const hookVerified = !runtime.includes('FRAMEWORK_HOOK_NOT_ATTACHED')
  const bindings = validateBindings(root)
  const versions = SUPPORTED_GAMES.map(game => {
    const target = game.packageName === GAME_PACKAGES.eightBallPool
    return {
      id: game.id,
      packageName: game.packageName,
      build: target ? TARGET_BUILD.split(' ').pop() : 'launcher profile',
      gates: {
        launcher: true,
        bindingsMeasured: target ? bindings.measured : false,
        hookVerified: target ? hookVerified : false,
        liveLinesVerifiedOnDevice: false
      }
    }
  })
  return { ok: versions.length > 0, versions, hookVerified, detail: `${versions.length} version profiles; hook ${hookVerified ? 'claimed' : 'stub until device attach'}` }
}

export const DEVICE_CHECKLIST = [
  'Install the unsigned debug APK on a real Android device (no root required).',
  'Grant overlay and notification permission from inside the active session only.',
  'Start session and confirm 8BP launches into a hosted :p0..:p3 process.',
  'VM status must report HOOK_ATTACHED, not STUB_ONLY.',
  'Capture state with probe/diff and save measured bindings for com.miniclip.eightballpool 56.34.0 (code 4064) only.',
  'Bindings status must become MEASURED before trusting any live line.',
  'Calibrate table rect on screen; verify cue/target/ghost/pocket lines align.',
  'Bind a hosted activity; verify inputStatus INPUT_READY before autoplay.',
  'Fire one manual shot, then one auto shot; confirm sent counter increments.',
  'Exit the game and confirm the overlay/line layer closes within 8 seconds.',
  'Repeat for every target build; do not reuse offsets across versions.'
]

export function runValidation(root = ROOT) {
  const checks = [
    { name: 'package', ...validatePackage(root) },
    { name: 'scripts', ...validateScripts(root) },
    { name: 'webAssets', ...validateWebAssets(root) },
    { name: 'java', ...validateJava(root) },
    { name: 'manifest', ...validateManifest(root) },
    { name: 'bindings', ...validateBindings(root) },
    { name: 'versionMatrix', ...validateVersionMatrix(root) }
  ]
  const blockers = checks.filter(check => !check.ok).map(check => `${check.name}: ${check.detail}`)
  const matrix = checks.find(check => check.name === 'versionMatrix')
  const limits = []
  if (!checks.find(check => check.name === 'bindings').measured) limits.push('Live 8BP offsets are UNMEASURED — live lines/autoplay cannot be trusted yet.')
  if (!matrix.hookVerified) limits.push('Framework hook is a stub until attach succeeds on a device.')
  limits.push('No APK compilation or device verification is possible on this bench (no JDK/SDK/device).')

  return {
    ok: blockers.length === 0,
    liveReady: blockers.length === 0 && checks.find(check => check.name === 'bindings').measured && matrix.hookVerified,
    generatedAt: new Date().toISOString(),
    version: checks[0].version,
    checks,
    blockers,
    limits,
    deviceChecklist: DEVICE_CHECKLIST
  }
}

export function writeReport(report, root = ROOT) {
  const dir = join(root, 'artifacts', 'validation')
  mkdirSync(dir, { recursive: true })
  const base = join(dir, `release-${report.version}`)
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`)
  const markdown = [
    `# D0J EnGine ${report.version} validation`,
    '',
    `- Structural build check: **${report.ok ? 'PASS' : 'FAIL'}**`,
    `- Live 8BP readiness: **${report.liveReady ? 'READY' : 'NOT READY'}**`,
    '',
    '## Checks',
    ...report.checks.map(check => `- ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`),
    '',
    '## Limits',
    ...report.limits.map(limit => `- ${limit}`),
    '',
    '## Device checklist',
    ...report.deviceChecklist.map((step, index) => `${index + 1}. ${step}`),
    ''
  ].join('\n')
  writeFileSync(`${base}.md`, markdown)
  return { json: `${base}.json`, markdown: `${base}.md` }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const report = runValidation(ROOT)
  const files = writeReport(report, ROOT)
  console.log(`D0J release validation ${report.version}: ${report.ok ? 'PASS' : 'FAIL'}`)
  for (const check of report.checks) console.log(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
  for (const limit of report.limits) console.log(`  LIMIT ${limit}`)
  console.log(`Report: ${relative(ROOT, files.json)} / ${relative(ROOT, files.markdown)}`)
  if (!report.ok) process.exitCode = 1
}
