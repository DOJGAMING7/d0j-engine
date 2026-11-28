// Step 2a: preparation of the installed game's Resources and Application must
// be real, staged and observable — without claiming a live hosted game.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const vmDir = 'android/app/src/main/java/com/d0j/engine/vm/'

test('game Resources and Application are built from the installed APKs', () => {
  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /class VMGameHost/)
  assert.match(host, /AssetManager\.class\.newInstance\(\)/)
  assert.match(host, /getDeclaredMethod\("addAssetPath", String\.class\)/)
  assert.match(host, /new Resources\(assets, base\.getDisplayMetrics\(\), base\.getConfiguration\(\)\)/)
  assert.match(host, /Class\.forName\(className, true, loader\)/)
  assert.match(host, /getDeclaredMethod\("attach", Context\.class\)/)
  assert.match(host, /extends ContextWrapper/)
  assert.match(host, /getResources\(\)[\s\S]*return resources/)
  assert.match(host, /getApplicationInfo\(\)[\s\S]*return info/)
  assert.ok(!host.includes('Resources.getSystem()'), 'must not fall back to system resources')
})

test('preparation runs before substitution and records each stage', () => {
  const core = read(vmDir + 'VMCore.java')
  assert.match(core, /VMGameHost\.prepare\(app, packageName, apkPaths, loader\)/)

  const host = read(vmDir + 'VMGameHost.java')
  assert.match(host, /RESOURCES_OK/)
  assert.match(host, /APPLICATION_ATTACHED/)
  assert.match(host, /HOST_PREPARE_OK/)
  assert.match(host, /HOST_PREPARE_FAIL/)

  const hosting = read(vmDir + 'VMHosting.java')
  assert.match(hosting, /STAGE_FILE/)
  assert.match(hosting, /markStage\(Context/)
  assert.match(hosting, /stage\(Context/)
  assert.match(hosting, /getFD\(\)\.sync\(\)/)
})

test('hosting stage is readable from Settings without a device log', () => {
  const provider = read(vmDir + 'SystemCallProvider.java')
  assert.ok(provider.includes('"hostingStage"'))
  assert.ok(provider.includes('VMHosting.stage(getContext())'))

  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  assert.ok(plugin.includes('public void vmHostingStage(PluginCall call)'))

  const nativeJs = read('src/lib/native.js')
  assert.ok(nativeJs.includes('vmHostingStage:'))
  assert.ok(nativeJs.includes("call('vmHostingStage')"))

  const settings = read('src/screens/Settings.jsx')
  assert.ok(settings.includes('native.vmHostingStage()'))
  assert.ok(settings.includes('Hosting stage:'))
})
