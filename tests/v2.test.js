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
  assert.equal(DEFAULT_CONFIG.purchaseGuard, true)
  assert.equal(GAME_PACKAGES.eightBallPool, 'com.miniclip.eightballpool')
  assert.equal(normalizeMode('Pro Fast'), 'Fast')
  assert.equal(normalizeMode('Pro Player'), 'Human')
  assert.equal(normalizeMode('Fast Mode'), 'Fast')
})

test('mod menu keeps the approved OCR labels and HOME MENU title', () => {
  const source = read('src/components/ModMenu.jsx') + read('src/lib/config.js')
  const required = [
    'HOME MENU',
    'BASIC SETTINGS', 'Show lines', 'Keep lines after shot', 'Power lock',
    'OTHER SETTINGS', 'Default power', 'Show pockets',
    'AUTO PLAY SETTINGS', 'Enable auto play', 'Auto play mode',
    'Pro Fast', 'Pro Player', 'Fast Mode', 'Break settings', 'Failed break',
    '8 BALL PLAY SETTINGS', 'Prioritize 9th ball', 'Paralysis opponent turn', 'Clean up shot',
    'GOLDEN SHOT SETTINGS', 'Golden shot target',
    'D0J AUTO QUEUE', 'ONE', 'SESSION', 'INFINITE',
    'TABLE / STATE', 'phase', 'turn', 'result', 'power', 'aimError',
    'PLAY', 'START', 'AUTOPLAY', 'STOP'
  ]
  for (const label of required) {
    assert.ok(source.includes(label), `missing mod menu label: ${label}`)
  }
  assert.ok(source.indexOf('>PLAY<') < source.indexOf('>START<'))
  assert.ok(source.indexOf('>START<') < source.indexOf('>AUTOPLAY<'))
  assert.ok(source.indexOf('>AUTOPLAY<') < source.indexOf('>STOP<'))
})

test('home screen has supported games and 8BP redirect target', () => {
  const source = read('src/screens/Home.jsx') + read('src/lib/config.js')
  for (const label of ['HOME MENU', 'SUPPORTED GAMES', '8 BALL POOL', 'CARROM POOL', 'SOCCER STARS', 'Best For Carrom Pool']) {
    assert.ok(source.includes(label), `missing home label: ${label}`)
  }
  const config = read('src/lib/config.js')
  assert.ok(config.includes("eightBallPool: 'com.miniclip.eightballpool'"))
})

test('native Android layer declares overlay, accessibility guard and game package', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.ok(manifest.includes('android.permission.SYSTEM_ALERT_WINDOW'))
  assert.ok(manifest.includes('D0JOverlayService'))
  assert.ok(manifest.includes('D0JGuardService'))
  assert.ok(manifest.includes('BIND_ACCESSIBILITY_SERVICE'))
  assert.ok(manifest.includes('com.miniclip.eightballpool'))
  assert.ok(manifest.includes('foregroundServiceType="specialUse"'))

  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  assert.ok(overlay.includes('TYPE_APPLICATION_OVERLAY'))
  assert.ok(overlay.includes('ACTION_UP'))
  assert.ok(overlay.includes('togglePanel()'))

  const guard = read('android/app/src/main/java/com/d0j/engine/D0JGuardService.java')
  assert.ok(guard.includes('GLOBAL_ACTION_BACK'))
  assert.ok(guard.includes('STRONG'))
})

test('script manifest hashes match shipped scripts', () => {
  const manifest = JSON.parse(read('scripts/index.json'))
  for (const entry of manifest.scripts) {
    const hash = createHash('sha256').update(read(entry.file)).digest('hex')
    assert.equal(entry.hash, hash, `${entry.id} hash mismatch`)
  }
})
