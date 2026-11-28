import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('quick test separates local core checks from informational device gates', () => {
  const app = read('src/App.jsx')
  assert.ok(app.includes("group = 'core'"), 'checks need an explicit group')
  assert.ok(app.includes("'device')"), 'permission and hook checks must be device gates')
  assert.ok(app.includes('const core = items.filter'))
  assert.ok(app.includes('const gates = items.filter'))
  assert.ok(app.includes('const ok = core.every(i => i.ok)'))
  assert.ok(app.includes('failed: failed.map(i => i.name)'), 'report must list failed check names')
  assert.ok(app.includes('${firstFailed?.name'), 'toast must name the failed step')
  assert.ok(app.includes('firstFailed?.detail'), 'toast must include the failure detail')
  assert.ok(app.includes('await bridge.getTable()'), 'table lookup is async and must be awaited')
  assert.ok(app.includes("add('VM hooks'"), 'hook status must be reported by the quick test')
  assert.ok(app.includes("native.vmHooks()"))
})

test('launch quick test runs after permissions and an active session are established', () => {
  const app = read('src/App.jsx')
  const start = app.indexOf('const startSession =')
  const block = app.slice(start, start + 4000)
  const permAt = block.indexOf('requestOverlayPermission')
  const testAt = block.indexOf("runQuickTest('launch')")
  assert.ok(permAt > -1, 'session flow still asks for overlay permission')
  assert.ok(testAt > permAt, 'launch test must not fail on a permission that has not been requested yet')
})

test('session end closes the in-app menu as well as live layers', () => {
  const app = read('src/App.jsx')
  const home = read('src/screens/Home.jsx')
  assert.ok(app.includes('const [menuCloseSignal, setMenuCloseSignal]'))
  assert.ok(app.includes('setMenuCloseSignal(n => n + 1)'))
  assert.ok(app.includes('menuCloseSignal={menuCloseSignal}'))
  assert.ok(home.includes('menuCloseSignal'))
  assert.ok(home.includes('setMenuOpen(false)'))
})

test('native overlay uses a side rail of tabs instead of one scroll pile', () => {
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  assert.ok(overlay.includes('menuTabButtons'))
  assert.ok(overlay.includes('renderMenuTab'))
  assert.ok(overlay.includes('{ "status", "◎", "Status" }'))
  assert.ok(overlay.includes('{ "lines", "╱", "Lines" }'))
  assert.ok(overlay.includes('{ "autoplay", "▶", "Auto" }'))
  assert.ok(overlay.includes('{ "queue", "☰", "Queue" }'))
  assert.ok(overlay.includes('{ "eightball", "8", "8 Ball" }'))
  assert.ok(overlay.includes('{ "settings", "⚙", "Settings" }'))
  assert.ok(overlay.includes('D0JPrefs.setString(D0JOverlayService.this, "menu_tab", id)'))
  assert.ok(overlay.includes('menuParams.gravity'))
})

test('floating rail exposes Auto Play, Auto Queue and Menu', () => {
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  assert.ok(overlay.includes('quickButton("PLAY", "autoPlay")'))
  assert.ok(overlay.includes('quickButton("QUEUE", "autoQueue")'))
  assert.ok(overlay.includes('quickButton("MENU", null)'))
  assert.ok(overlay.includes('"AUTO PLAY "'))
  assert.ok(overlay.includes('"AUTO QUEUE "'))
  assert.ok(overlay.includes('refreshQuickControls'))
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  assert.ok(plugin.includes('D0JOverlayService.onConfigChanged(patch)'))
  const lines = read('src/lib/liveLines.js')
  assert.ok(lines.includes('export const BALL_COLORS'))
  assert.ok(lines.includes('colorForBall'))
  assert.ok(lines.includes('cueColor'))
})

test('native menu disappears on the first game-exit evidence tick', () => {
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  const start = overlay.indexOf('private final Runnable sessionWatchdog')
  const block = overlay.slice(start, start + 1400)
  assert.ok(block.includes('gameExitTicks == 1'))
  assert.ok(block.indexOf('removeMenu()') < block.indexOf('gameExitTicks >= 2'))
  assert.ok(block.includes('main.postDelayed(this, 2000)'))
})

test('hook report exposes redirect availability and per-hook detail', () => {
  const installer = read('android/app/src/main/java/com/d0j/engine/vm/VMHookInstaller.java')
  assert.ok(installer.includes('value.put("redirect", redirect)'))
  assert.ok(installer.includes('" am=" + activityManager'))
  assert.ok(installer.includes('" pm=" + packageManager'))
  assert.ok(installer.includes('AM getService:'))
  assert.ok(installer.includes('PM getService:'))
  assert.ok(installer.includes('boolean redirectReady = "ATTACHED".equals(instrumentation)'))
  assert.ok(installer.includes('if (redirectReady) VMRuntime.install(new AttachedInstrumentation())'))
  const settings = read('src/screens/Settings.jsx')
  assert.ok(settings.includes('Hook detail:'))
  const app = read('src/App.jsx')
  assert.ok(app.includes('redirect=${res?.redirect'))
})

test('D0JPrefs writes always pass a context', () => {
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  const calls = overlay.match(/D0JPrefs\.set(?:Int|Boolean|String)\([^;]+;/g) || []
  assert.ok(calls.length > 0)
  for (const call of calls) {
    const args = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')).split(',')
    assert.equal(args.length, 3, `bad prefs call: ${call}`)
  }
})

test('probe export is reachable from settings', () => {
  const settings = read('src/screens/Settings.jsx')
  assert.ok(settings.includes('COPY PROBE JSON'))
  assert.ok(settings.includes('className="probe-export"'))
  assert.ok(settings.includes('navigator.clipboard.writeText'))
})
