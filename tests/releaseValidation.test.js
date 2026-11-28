import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  balancedSource,
  runValidation,
  validateBindings,
  validateJava,
  validateManifest,
  validatePackage,
  validateScripts,
  validateVersionMatrix,
  validateWebAssets
} from '../scripts/validate-release.mjs'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const hasBuildArtifacts = () =>
  existsSync(resolve(root, 'dist', 'index.html'))
  && existsSync(resolve(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html'))

function fixtureRoot() {
  const temp = mkdtempSync(join(tmpdir(), 'd0j-release-'))
  const bases = [
    'scripts', 'public/scripts', 'dist/scripts',
    'android/app/src/main/assets/public/scripts'
  ]
  for (const base of [...bases, 'dist', 'android/app/src/main/assets/public']) {
    mkdirSync(join(temp, base), { recursive: true })
  }
  const manifest = JSON.parse(read('scripts/index.json'))
  writeFileSync(join(temp, 'scripts', 'index.json'), JSON.stringify(manifest))
  for (const entry of manifest.scripts) {
    const file = String(entry.file).replace(/^scripts\//, '')
    const source = readFileSync(resolve(root, 'scripts', file))
    for (const base of bases) writeFileSync(join(temp, base, file), source)
  }
  const html = '<html>fixture</html>'
  writeFileSync(join(temp, 'dist', 'index.html'), html)
  writeFileSync(join(temp, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html'), html)
  return temp
}

test('balance scan catches malformed Java structure', () => {
  assert.equal(balancedSource('class A { void f() { } }'), true)
  assert.equal(balancedSource('class A { void f() { }'), false)
  assert.equal(balancedSource('int[] a = {1, 2};'), true)
  assert.equal(balancedSource('int[] a = {1, 2;'), false)
})

test('release inputs are consistent across package, scripts and native assets', () => {
  const pkg = validatePackage(root)
  assert.equal(pkg.ok, true)
  assert.equal(pkg.version, '2.1.1')

  // CI runs tests before build/cap sync, so generated files may be absent.
  const temp = hasBuildArtifacts() ? null : fixtureRoot()
  try {
    const target = temp || root
    const scripts = validateScripts(target)
    assert.equal(scripts.ok, true)
    assert.equal(scripts.items.length, 2)
    for (const item of scripts.items) {
      assert.equal(item.copies.length, 4)
      assert.ok(item.copies.every(copy => copy.hash === item.expected))
      assert.equal(item.copies[3].base, 'android/app/src/main/assets/public/scripts')
    }

    const web = validateWebAssets(target)
    assert.equal(web.ok, true)
    assert.ok(web.files > 2)
    assert.deepEqual(web.mismatches, [])
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true })
  }
})

test('native structure and bindings are honest', () => {
  const java = validateJava(root)
  assert.equal(java.ok, true)
  assert.ok(java.files > 20)
  assert.deepEqual(java.missing, [])
  assert.equal(java.accessibility, false)

  const manifest = validateManifest(root)
  assert.equal(manifest.ok, true)
  assert.deepEqual(manifest.missing, [])

  const bindings = validateBindings(root)
  assert.equal(bindings.ok, true)
  assert.equal(bindings.honest, true)
  assert.equal(bindings.measured, false)

  const matrix = validateVersionMatrix(root)
  assert.equal(matrix.versions.length, 3)
  assert.equal(matrix.hookVerified, false)
  assert.equal(matrix.versions[0].gates.bindingsMeasured, false)
  assert.equal(matrix.versions[0].gates.liveLinesVerifiedOnDevice, false)
})

test('stale native web assets are detected', () => {
  const temp = mkdtempSync(join(tmpdir(), 'd0j-validate-'))
  try {
    mkdirSync(join(temp, 'dist'))
    writeFileSync(join(temp, 'dist', 'index.html'), '<html>new</html>')
    const result = validateWebAssets(temp)
    assert.equal(result.ok, false)
    assert.match(result.detail, /stale native assets/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('full report passes after build but never claims live readiness', () => {
  const report = runValidation(root)
  if (hasBuildArtifacts()) {
    assert.equal(report.ok, true)
    assert.deepEqual(report.blockers, [])
  } else {
    // Clean checkout: the release gate must fail loudly, not fake a pass.
    assert.equal(report.ok, false)
    assert.ok(report.blockers.some(blocker => blocker.startsWith('scripts:')))
    assert.ok(report.blockers.some(blocker => blocker.startsWith('webAssets:')))
  }
  assert.equal(report.liveReady, false)
  assert.ok(report.limits.length >= 3)
  assert.ok(report.deviceChecklist.length >= 10)
  assert.ok(report.deviceChecklist.some(step => step.includes('56.34.0')))

  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['validate:release'], 'node scripts/validate-release.mjs')
  assert.ok(pkg.scripts['release:local'].includes('npm run sync:web'))
  assert.equal(existsSync(resolve(root, 'docs/VALIDATION.md')), true)
})
