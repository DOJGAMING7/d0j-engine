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

  const scripts = validateScripts(root)
  assert.equal(scripts.ok, true)
  assert.equal(scripts.items.length, 2)
  for (const item of scripts.items) {
    assert.equal(item.copies.length, 4)
    assert.ok(item.copies.every(copy => copy.hash === item.expected))
    assert.equal(item.copies[3].base, 'android/app/src/main/assets/public/scripts')
  }

  const web = validateWebAssets(root)
  assert.equal(web.ok, true)
  assert.ok(web.files > 2)
  assert.deepEqual(web.mismatches, [])
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

test('full report passes locally but never claims live readiness', () => {
  const report = runValidation(root)
  assert.equal(report.ok, true)
  assert.deepEqual(report.blockers, [])
  assert.equal(report.liveReady, false)
  assert.ok(report.limits.length >= 3)
  assert.ok(report.deviceChecklist.length >= 10)
  assert.ok(report.deviceChecklist.some(step => step.includes('56.34.0')))

  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['validate:release'], 'node scripts/validate-release.mjs')
  assert.ok(pkg.scripts['release:local'].includes('npm run sync:web'))
  assert.equal(existsSync(resolve(root, 'docs/VALIDATION.md')), true)
})
