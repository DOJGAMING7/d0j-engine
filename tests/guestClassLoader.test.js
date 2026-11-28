// The game must load its own AppCompat/R classes so layout IDs match its
// resource table. A parent-first loader handed the game our R IDs instead.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const vmDir = 'android/app/src/main/java/com/d0j/engine/vm/'

test('a guest-first classloader prefers the game classes over app duplicates', () => {
  const loader = read(vmDir + 'VMGuestClassLoader.java')
  assert.match(loader, /class VMGuestClassLoader extends DexClassLoader/)
  assert.match(loader, /protected Class<\?> loadClass\(String name, boolean resolve\)/)
  assert.match(loader, /found = findClass\(name\)/)
  assert.match(loader, /catch \(ClassNotFoundException e\)[\s\S]*super\.loadClass\(name, false\)/)
  assert.match(loader, /"android\."/)
  assert.match(loader, /"com\.d0j\."/)
  assert.match(loader, /"java\."/)
})

test('both prepare and launch use the guest-first loader', () => {
  const core = read(vmDir + 'VMCore.java')
  const uses = core.match(/new VMGuestClassLoader\(/g) || []
  assert.ok(uses.length >= 2, 'prepare and launch must both use VMGuestClassLoader')
  assert.ok(!core.includes('new dalvik.system.DexClassLoader('), 'no parent-first loader remains')
  assert.ok(core.includes('CLASSLOADER_GUEST_FIRST'))
})

test("the game's manifest theme is applied before Activity.attach", () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /public static void applyThemeBeforeAttach\(Activity activity, String packageName,/)
  assert.match(host, /getActivityInfo\(\s*new ComponentName\(packageName, target\)/)
  assert.match(host, /getApplicationInfo\(\s*packageName, 0\)/)
  assert.match(host, /activity\.setTheme\(theme\)/)
  assert.match(host, /THEME_ID:/)
  assert.match(host, /private static Object getField\(Object target, String name\)/)
  assert.match(host, /THEME_TEMP_BASE_SET/)
  assert.match(host, /setField\(activity, "mBase", wrap\(prepared, report\)\)/)
  assert.match(host, /setField\(activity, "mBase", originalBase\)/)
  assert.match(host, /THEME_PREATTACH_SET:/)
  assert.match(host, /THEME_PREATTACH_FAIL:/)
  assert.match(host, /THEME_PREATTACH_ONLY/)
  assert.ok(!host.includes('setThemeField('), 'no post-attach theme field reflection')
  assert.ok(!host.includes('THEME_FAIL:'), 'no stale post-attach theme failure marker')

  const hook = read(vmDir + 'HookInstrumentation.java')
  assert.match(hook, /VMGameHost\.applyThemeBeforeAttach\(/)
})

test('the game Application.onCreate is invoked before the Activity', () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /getDeclaredMethod\("onCreate"\)/)
  assert.match(host, /onCreate\.invoke\(application\)/)
  assert.match(host, /APPLICATION_ONCREATE_OK/)
  assert.match(host, /APPLICATION_ONCREATE_FAIL/)
})
