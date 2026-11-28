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

test("the game's manifest theme is applied from its own resources", () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /private static void installTheme\(Activity activity, Prepared prepared, Context report\)/)
  assert.match(host, /getActivityInfo\(\s*new ComponentName\(prepared\.packageName, target\)/)
  assert.match(host, /prepared\.info\.theme/)
  // A theme must be built from the game's Resources, not copied from our app.
  assert.match(host, /prepared\.resources\.newTheme\(\)/)
  assert.match(host, /gameTheme\.applyStyle\(theme, true\)/)
  assert.match(host, /setField\(activity, "mTheme", gameTheme\)/)
  assert.match(host, /setField\(activity, "mThemeResource", theme\)/)
  assert.ok(!host.includes('activity.setTheme(theme)'), 'no setTheme copy from our resources')
  // Diagnostics must be visible in our storage, with failures surfaced.
  assert.match(host, /VMHosting\.markStage\(report, "THEME_ID:" \+ theme\)/)
  assert.match(host, /VMHosting\.markStage\(report, "THEME_APPLIED:" \+ theme\)/)
  assert.match(host, /VMHosting\.markStage\(report, "THEME_FAIL:" \+ describe\(e\)\)/)
  assert.match(host, /installTheme\(activity, prepared, report\)/)
  // The delegate reads the base context's theme too.
  assert.match(host, /private Resources\.Theme theme;/)
  assert.match(host, /@Override public Resources\.Theme getTheme\(\)/)
})

test('the game Application.onCreate is invoked before the Activity', () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /getDeclaredMethod\("onCreate"\)/)
  assert.match(host, /onCreate\.invoke\(application\)/)
  assert.match(host, /APPLICATION_ONCREATE_OK/)
  assert.match(host, /APPLICATION_ONCREATE_FAIL/)
})
