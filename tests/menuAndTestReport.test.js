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
  const discoveryAt = block.indexOf('native.discoverGame(pkg)')
  const sessionAt = block.indexOf('native.startSession(')
  const testAt = block.indexOf("runQuickTest('launch')")
  assert.ok(discoveryAt > -1, 'session flow discovers the installed game')
  assert.ok(sessionAt > discoveryAt, 'session starts only after discovery')
  assert.ok(testAt > sessionAt, 'launch test must not fail before the session is established')
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

test('in-window menu uses a side rail of tabs instead of one scroll pile', () => {
  const hud = read('android/app/src/main/java/com/d0j/engine/D0JGameHud.java')
  assert.ok(hud.includes('renderMenuTab'))
  assert.ok(hud.includes('{ "status", "STATUS", "Status" }'))
  assert.ok(hud.includes('{ "lines", "LINES", "Lines" }'))
  assert.ok(hud.includes('{ "autoplay", "AUTO", "Auto Play" }'))
  assert.ok(hud.includes('{ "queue", "QUEUE", "Auto Queue" }'))
  assert.ok(hud.includes('{ "settings", "SET", "Settings" }'))
  assert.ok(hud.includes('D0JPrefs.setString(activity, "menu_tab", tab)'))
  assert.ok(hud.includes('lp.gravity = Gravity.TOP | Gravity.START'))
  assert.ok(hud.includes('decor.addView(container)'))
})

test('floating rail exposes Auto Play, Auto Queue and Menu', () => {
  const hud = read('android/app/src/main/java/com/d0j/engine/D0JGameHud.java')
  assert.ok(hud.includes('quickButton("PLAY", "autoPlay")'))
  assert.ok(hud.includes('quickButton("QUEUE", "autoQueue")'))
  assert.ok(hud.includes('quickButton("MENU", null)'))
  assert.ok(hud.includes('"AUTO PLAY "'))
  assert.ok(hud.includes('"AUTO QUEUE "'))
  assert.ok(hud.includes('refreshQuickControls'))
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  assert.ok(plugin.includes('D0JGameHud.refreshQuickControls()'))
  const lines = read('src/lib/liveLines.js')
  assert.ok(lines.includes('export const BALL_COLORS'))
  assert.ok(lines.includes('colorForBall'))
  assert.ok(lines.includes('cueColor'))
})

test('game-exit evidence ends the session and clears in-window layers', () => {
  const service = read('android/app/src/main/java/com/d0j/engine/D0JSessionService.java')
  const start = service.indexOf('private final Runnable sessionWatchdog')
  const block = service.slice(start, start + 1400)
  assert.ok(block.includes('gameExited()'))
  assert.ok(block.includes('stopSessionInternal("GAME_EXITED")'))
  assert.ok(block.includes('main.postDelayed(this, 2000)'))
  assert.ok(service.includes('D0JGameHud.pushLines(this, "{}")'))
  assert.ok(service.includes('onTaskRemoved'))
  const app = read('src/App.jsx')
  assert.ok(app.includes("native.addListener('sessionEnded'"))
  assert.ok(app.includes('setMenuCloseSignal(n => n + 1)'))
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
  for (const file of ['android/app/src/main/java/com/d0j/engine/D0JGameHud.java',
    'android/app/src/main/java/com/d0j/engine/D0JSessionService.java']) {
    const source = read(file)
    const calls = source.match(/D0JPrefs\.set(?:Int|Boolean|String)\([^;]+;/g) || []
    assert.ok(calls.length > 0)
    for (const call of calls) {
      const args = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')).split(',')
      assert.equal(args.length, 3, `bad prefs call: ${call}`)
    }
  }
})

test('probe export is reachable from settings', () => {
  const settings = read('src/screens/Settings.jsx')
  assert.ok(settings.includes('COPY PROBE JSON'))
  assert.ok(settings.includes('className="probe-export"'))
  assert.ok(settings.includes('navigator.clipboard.writeText'))
})
