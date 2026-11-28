import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyPass, PASS_HASH, PASS_SALT } from '../src/lib/apkPass.js'
import { DEFAULT_CONFIG, GAME_PACKAGES, normalizeMode } from '../src/lib/config.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')

test('APK PASS uses a salted hash and accepts only the private key', async () => {
  const expected = createHash('sha256').update(PASS_SALT + 'XBOXS@7860').digest('hex')
  assert.equal(PASS_HASH, expected)
  assert.equal(await verifyPass('XBOXS@7860'), true)
  assert.equal(await verifyPass('wrong'), false)
  assert.equal(await verifyPass(''), false)
})

test('v2 config contains the reference feature names', () => {
  assert.equal(DEFAULT_CONFIG.autoPlayMode, 'Pro Fast')
  assert.equal(DEFAULT_CONFIG.showLines, true)
  assert.equal(DEFAULT_CONFIG.keepLines, true)
  assert.equal(DEFAULT_CONFIG.powerLock, false)
  assert.equal(DEFAULT_CONFIG.showPockets, true)
  assert.equal(DEFAULT_CONFIG.failedBreak, false)
  assert.equal(DEFAULT_CONFIG.prioritize9, false)
  assert.equal(DEFAULT_CONFIG.paralysisOpponent, false)
  assert.equal(DEFAULT_CONFIG.cleanUpShot, false)
  assert.equal(DEFAULT_CONFIG.goldenTarget, 1)
  assert.equal(DEFAULT_CONFIG.autoQueue, false)
  assert.equal(DEFAULT_CONFIG.runTestOnLaunch, true)
  assert.equal(DEFAULT_CONFIG.blockLaunchOnFail, false)
  assert.equal(GAME_PACKAGES.eightBallPool, 'com.miniclip.eightballpool')
  assert.equal(normalizeMode('Pro Fast'), 'Fast')
  assert.equal(normalizeMode('Pro Player'), 'Human')
  assert.equal(normalizeMode('Fast Mode'), 'Fast')
})

test('mod menu keeps core cheats and clean session labels', () => {
  const source = read('src/components/ModMenu.jsx') + read('src/lib/config.js') + read('src/screens/Home.jsx')
  const required = [
    'Snake Engine Mod Menu',
    'Show lines', 'Keep lines after shot', 'Power lock',
    'Default power', 'Show pockets',
    'Enable auto play', 'Auto play mode',
    'Pro Fast', 'Pro Player', 'Fast Mode', 'Failed break',
    'Prioritize 9th ball', 'Paralysis opponent turn', 'Clean up shot',
    'Golden shot target',
    'Auto queue', 'ONE', 'SESSION', 'INFINITE',
    'Match limit', 'Delay', 'Jitter', 'Retries', 'Stop on manual input',
    'Select table (tap to select)', 'Queue Table',
    'LAUNCH 8BP', 'RUN TEST', 'STOP'
  ]
  for (const label of required) {
    assert.ok(source.includes(label), `missing mod menu label: ${label}`)
  }
  assert.ok(!source.includes('Purchase guard'), 'purchase guard UI should be removed')
})

test('home screen has supported games and 8BP redirect target', () => {
  const source = read('src/screens/Home.jsx') + read('src/lib/config.js')
  for (const label of ['Supported Games', '8 BALL POOL', 'CARROM POOL', 'SOCCER STARS']) {
    assert.ok(source.includes(label), `missing home label: ${label}`)
  }
  const config = read('src/lib/config.js')
  assert.ok(config.includes("eightBallPool: 'com.miniclip.eightballpool'"))
})

test('native Android layer declares session overlay without accessibility guard', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.ok(manifest.includes('android.permission.SYSTEM_ALERT_WINDOW'))
  assert.ok(manifest.includes('android.permission.POST_NOTIFICATIONS'))
  assert.ok(manifest.includes('D0JOverlayService'))
  assert.ok(!manifest.includes('D0JGuardService'))
  assert.ok(!manifest.includes('BIND_ACCESSIBILITY_SERVICE'))
  assert.ok(manifest.includes('com.miniclip.eightballpool'))
  assert.ok(manifest.includes('foregroundServiceType="specialUse"'))

  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  assert.ok(overlay.includes('TYPE_APPLICATION_OVERLAY'))
  assert.ok(overlay.includes('ACTION_START_SESSION'))
  assert.ok(overlay.includes('ACTION_STOP_SESSION'))
  assert.ok(overlay.includes('ACTION_UPDATE_STATUS'))
  assert.ok(overlay.includes('stopSessionInternal'))
})

test('all-line prediction is wired into the client and floating menu', () => {
  const app = read('src/App.jsx')
  const table = read('src/screens/TableDemo.jsx')
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')

  assert.ok(app.includes("command === 'runLineTest'"), 'overlay line command is not handled')
  assert.ok(app.includes('onRunLineScript={runLineTest}'), 'table screen cannot run the script')
  assert.ok(app.includes("if (!overlayMode && report?.ok) setTab('table')"), 'client does not open the table after the script')
  assert.ok(app.includes('native.requestNotificationPermission()'), 'session start does not request notification permission')
  assert.ok(table.includes('state.lines'), 'table screen does not render stored lines')
  assert.ok(table.includes('RUN ALL LINES'), 'table screen has no all-line action')
  assert.ok(overlay.includes('Run All Prediction Lines'), 'floating menu still shows the old 3-shot action')
})

test('script manifest hashes match shipped scripts', () => {
  const manifest = JSON.parse(read('scripts/index.json'))
  for (const entry of manifest.scripts) {
    const hash = createHash('sha256').update(read(entry.file)).digest('hex')
    assert.equal(entry.hash, hash, `${entry.id} hash mismatch`)
  }
})

test('OTA gate cannot recurse into a cached UI iframe', () => {
  const gate = read('src/components/BundleGate.jsx')
  const storage = read('src/lib/storage.js')

  assert.ok(gate.includes('isEmbeddedUi()'))
  assert.ok(gate.includes('rollbackBundle()'))
  assert.ok(gate.includes('MIGRATION_VERSION'))
  assert.ok(gate.includes('setPref(KEYS.migration, MIGRATION_VERSION)'))
  assert.ok(gate.includes('ui=cache'))

  assert.ok(storage.includes('export const MIGRATION_VERSION = 2'))
  assert.ok(storage.includes('checkOnLaunch: false'))
  assert.ok(storage.includes('export function isEmbeddedUi()'))
  assert.ok(storage.includes('window.self !== window.top'))
  assert.ok(storage.includes("get('ui') === 'cache'"))
})

test('D0JNative is registered before the Capacitor bridge is created', () => {
  const main = read('android/app/src/main/java/com/d0j/engine/MainActivity.java')
  const registerAt = main.indexOf('registerPlugin(D0JNativePlugin.class)')
  const superAt = main.indexOf('super.onCreate(savedInstanceState)')
  assert.ok(registerAt >= 0, 'registerPlugin call missing')
  assert.ok(superAt >= 0, 'super.onCreate call missing')
  assert.ok(registerAt < superAt, 'registerPlugin must run before super.onCreate')

  const native = read('src/lib/native.js')
  assert.ok(native.includes('handle.catch(() => noopHandle)'))
  assert.ok(native.includes('return Promise.resolve(noopHandle)'))

  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  assert.ok(plugin.includes('if (options == null) options = call.getData();'))
})

test('release version is bumped to 2.1.1', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.version, '2.1.1')

  const gradle = read('android/app/build.gradle')
  assert.ok(gradle.includes('versionCode 7'))
  assert.ok(gradle.includes('versionName "2.1.1"'))
})
