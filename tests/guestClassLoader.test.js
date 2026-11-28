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

test("the game's manifest theme is applied before onCreate", () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /private static void installTheme\(Activity activity, Prepared prepared\)/)
  assert.match(host, /getActivityInfo\(\s*new ComponentName\(prepared\.packageName, target\)/)
  assert.match(host, /prepared\.info\.theme/)
  assert.match(host, /setField\(activity, "mTheme", null\)/)
  assert.match(host, /activity\.setTheme\(theme\)/)
  assert.match(host, /THEME_APPLIED/)
  assert.match(host, /installTheme\(activity, prepared\)/)
})

test('the game Application.onCreate is invoked before the Activity', () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /getDeclaredMethod\("onCreate"\)/)
  assert.match(host, /onCreate\.invoke\(application\)/)
  assert.match(host, /APPLICATION_ONCREATE_OK/)
  assert.match(host, /APPLICATION_ONCREATE_FAIL/)
})
