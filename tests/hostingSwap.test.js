// Step 2b: the original hosting exception must be preserved and the framework
// lifecycle flag satisfied, then the prepared game context must be installed
// on the substituted Activity before its onCreate runs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const vmDir = 'android/app/src/main/java/com/d0j/engine/vm/'

test('caught hosting failures keep the framework mCalled flag consistent', () => {
  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /private static void markCalled\(Activity activity\)/)
  assert.match(hook, /getDeclaredField\("mCalled"\)/)
  assert.match(hook, /field\.setBoolean\(activity, true\)/)
  assert.match(hook, /callActivityOnCreate[\s\S]*markCalled\(activity\)/)
  assert.match(hook, /hostedLifecycleFailed[\s\S]*markCalled\(activity\)/)
  assert.ok(hook.includes('SuperNotCalledException'), 'documents the framework check we satisfy')
})

test('the original exception is saved, not just logged', () => {
  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /private static void saveHostingError\(Context context, String stage, Throwable error\)/)
  assert.match(hook, /saveHostingError\(context, "callActivityOnCreate", e\)/)
  assert.match(hook, /saveHostingError\(context, stage, e\)/)
  assert.match(hook, /hostedLifecycleFailed\(activity, e, "onDestroy"\)/)
  assert.match(hook, /saveHostingError\(core\.context\(\), "newActivity", e\)/)

  const hosting = read(vmDir + 'VMHosting.java')
  assert.match(hosting, /ERROR_FILE = "vm_hosting_error\.txt"/)
  assert.match(hosting, /markError\(Context context, String error\)/)
  assert.match(hosting, /static String error\(Context context\)/)

  const provider = read(vmDir + 'SystemCallProvider.java')
  assert.ok(provider.includes('VMHosting.error(getContext())'))

  const settings = read('src/screens/Settings.jsx')
  assert.ok(settings.includes('hostingInfo?.error'))
})

test('diagnostics keep every failure and use our own app context', () => {
  const hosting = read(vmDir + 'VMHosting.java')
  assert.match(hosting, /NEXT FAILURE/)
  assert.match(hosting, /System\.currentTimeMillis\(\)/)

  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /private static Context reportContext\(Activity activity\)/)
  assert.match(host, /VMCore\.peek\(\)/)
  assert.match(host, /VMHosting\.markStage\(report, "ACTIVITY_SWAP_START"\)/)

  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /SUBSTITUTE_ATTEMPT/)
  assert.match(hook, /if \(!"onDestroy"\.equals\(stage\)\)/)
})

test('game Resources come from the installed app, not a hand-built table', () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /createPackageContext\(packageName, Context\.CONTEXT_IGNORE_SECURITY\)/)
  assert.match(host, /resources = gameContext\.getResources\(\)/)
  assert.match(host, /RESOURCES_SOURCE:GAME_CONTEXT/)
  assert.match(host, /RESOURCES_SOURCE:ASSET_PATH/)
  assert.match(host, /GAME_CONTEXT_FAIL/)
  assert.match(host, /new GameContext\(\s*gameContext == null \? host : gameContext/)
})

test('a stale host panel is removed when hosting fails', () => {
  const proxy = read(vmDir + 'VMProxyActivity.java')
  assert.match(proxy, /CopyOnWriteArrayList/)
  assert.match(proxy, /public static void finishAll\(\)/)
  assert.match(proxy, /LIVE\.add\(new WeakReference<VMProxyActivity>\(this\)\)/)

  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /VMProxyActivity\.finishAll\(\)/)
})

test('status never claims a confirmed in-window host before proof', () => {
  const app = read('src/App.jsx')
  assert.ok(app.includes('In-window hosting requested for'))
  assert.ok(!app.includes('in-window controls active'))
})

test('prepared game context is installed on the Activity before onCreate', () => {
  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /callActivityOnCreate[\s\S]*VMGameHost\.apply\(activity, pkg\)/)
  assert.match(hook, /attachBaseContext\(\) would throw/)
  const newActivityBody = hook.slice(hook.indexOf('Activity newActivity('), hook.indexOf('void callActivityOnCreate('))
  assert.ok(!newActivityBody.includes('VMGameHost.apply'), 'swap must not happen in newActivity()')

  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /Context gameBase = wrap\(prepared, activity\.getBaseContext\(\)\)/)
  assert.match(host, /public static boolean apply\(Activity activity, String packageName\)/)
  assert.match(host, /setField\(activity, "mBase", gameBase\)/)
  assert.match(host, /setField\(activity, "mResources", prepared\.resources\)/)
  assert.match(host, /setField\(activity, "mApplication", prepared\.application\)/)
  assert.match(host, /installPackageInfo\(activity, prepared\)/)
  assert.match(host, /ACTIVITY_CONTEXT_SWAPPED/)
})
