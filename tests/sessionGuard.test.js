import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { guardSummary, shouldCloseSession } from '../src/lib/sessionGuard.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')

test('session guard closes only on explicit stop or positive exit evidence', () => {
  assert.equal(shouldCloseSession({ sessionActive: true }, { verdict: 'GAME_ALIVE' }), false)
  assert.equal(shouldCloseSession({ sessionActive: true }, { verdict: 'UNKNOWN' }), false)
  assert.equal(shouldCloseSession({ sessionActive: true }, { verdict: 'WATCH_UNAVAILABLE' }), false)
  assert.equal(shouldCloseSession({ sessionActive: false }, { verdict: 'GAME_ALIVE' }), true)
  assert.equal(shouldCloseSession({ sessionActive: true }, { verdict: 'GAME_EXITED' }), true)
  assert.equal(shouldCloseSession({ sessionActive: true }, { verdict: 'SESSION_ENDED' }), true)
  assert.match(guardSummary({ verdict: 'GAME_EXITED', evidence: 'ACTIVITY', topPackage: 'x' }), /ACTIVITY/)
})

test('step 7 lifecycle evidence is reported from the hosted process', () => {
  const monitor = read('android/app/src/main/java/com/d0j/engine/vm/VMLifecycleMonitor.java')
  const input = read('android/app/src/main/java/com/d0j/engine/vm/VMInputProvider.java')
  const memory = read('android/app/src/main/java/com/d0j/engine/vm/VMMemoryProvider.java')
  const proxy = read('android/app/src/main/java/com/d0j/engine/vm/VMProxyActivity.java')
  const hook = read('android/app/src/main/java/com/d0j/engine/vm/HookInstrumentation.java')
  const calls = read('android/app/src/main/java/com/d0j/engine/vm/SystemCallProvider.java')

  assert.ok(monitor.includes('registerActivityLifecycleCallbacks'))
  assert.ok(monitor.includes('onActivityDestroyed'))
  assert.ok(monitor.includes('"hostActivity"'))
  assert.ok(!monitor.includes('AccessibilityService'))
  assert.ok(!monitor.includes('android.accessibility'))
  assert.ok(input.includes('VMLifecycleMonitor.install'))
  assert.ok(memory.includes('VMLifecycleMonitor.install'))
  assert.ok(proxy.includes('VMLifecycleMonitor.install'))
  assert.ok(hook.includes('VMLifecycleMonitor.install'))
  assert.ok(calls.includes('"hostActivity"'))
  assert.ok(calls.includes('"sessionWatch"'))
  assert.ok(calls.includes('"GAME_EXITED"'))
  assert.ok(calls.includes('hasUsageAccess'))
})

test('step 7 watchdog auto-closes and clears every overlay layer', () => {
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const app = read('src/App.jsx')
  const settings = read('src/screens/Settings.jsx')
  const manifest = read('android/app/src/main/AndroidManifest.xml')

  assert.ok(overlay.includes('gameExited()'))
  assert.ok(overlay.includes('stopSessionInternal("GAME_EXITED")'))
  assert.ok(overlay.includes('onTaskRemoved'))
  assert.ok(overlay.includes('removeLineLayer()'))
  assert.ok(overlay.includes('notifySessionEnded'))
  assert.ok(!overlay.includes('Accessibility'))
  assert.ok(plugin.includes('vmSessionWatch'))
  assert.ok(plugin.includes('notifySessionEnded'))
  assert.ok(nativeJs.includes('vmSessionWatch'))
  assert.ok(app.includes("native.addListener('sessionEnded'"))
  assert.ok(app.includes('shouldCloseSession(session, watch)'))
  assert.ok(settings.includes('Session Guard · step 7'))
  assert.ok(!manifest.includes('android.accessibilityservice'))
  assert.ok(!manifest.includes('BIND_ACCESSIBILITY_SERVICE'))
})
