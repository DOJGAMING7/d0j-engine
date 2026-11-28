import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const vmDir = 'android/app/src/main/java/com/d0j/engine/vm/'

test('VM manifest declares daemon, four child processes and the VM call provider', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.ok(manifest.includes('.vm.VMDaemonService'))
  for (let i = 0; i < 4; i++) {
    assert.ok(manifest.includes(`.vm.VMProxyService${i}`), `missing proxy service ${i}`)
    assert.ok(manifest.includes(`.vm.VMProxyActivity${i}`), `missing proxy activity ${i}`)
    assert.ok(manifest.includes(`android:process=":p${i}"`), `missing process :p${i}`)
  }
  assert.ok(manifest.includes('.vm.SystemCallProvider'))
  assert.ok(manifest.includes('${applicationId}.vmcall'))
  assert.ok(manifest.includes('.vm.VMReceiver'))
  assert.ok(!manifest.includes('BIND_ACCESSIBILITY_SERVICE'), 'A1 forbids accessibility')
})

test('VM host ships an honest stub instead of a fake game hook', () => {
  const runtime = read(vmDir + 'VMRuntime.java')
  const core = read(vmDir + 'VMCore.java')
  const hook = read(vmDir + 'VMInstrumentation.java')

  assert.ok(runtime.includes('FRAMEWORK_HOOK_NOT_ATTACHED'))
  assert.ok(runtime.includes('public boolean isReady() { return false; }'))
  assert.ok(hook.includes('boolean startActivity('))
  assert.ok(core.includes('instrumentation.isReady()'))
  assert.ok(core.includes('CLASSLOADER_ONLY'))
})

test('VM install and launch really parse APKs and extract native libraries', () => {
  const core = read(vmDir + 'VMCore.java')
  const libs = read(vmDir + 'VMNativeLibs.java')

  assert.ok(core.includes('getPackageArchiveInfo'))
  assert.ok(core.includes('PackageManager.GET_ACTIVITIES'))
  assert.ok(core.includes('DexClassLoader'))
  assert.ok(libs.includes('Build.SUPPORTED_ABIS'))
  assert.ok(libs.includes('ZipFile'))
  assert.ok(libs.includes('setExecutable'))
})

test('native bridge and Capacitor plugin expose VM calls', () => {
  const nativeJs = read('src/lib/native.js')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')

  for (const method of ['vmStatus', 'vmList', 'vmInstall', 'vmLaunch', 'vmStopApp', 'vmDaemon', 'vmHooks', 'vmAttach']) {
    assert.ok(nativeJs.includes(`${method}:`), `missing native.${method}`)
    assert.ok(plugin.includes(`public void ${method}(PluginCall call)`), `missing plugin method ${method}`)
  }
  assert.ok(plugin.includes('call(uri, "VM", null, args)'))
})

test('step 3 hooks are attemptable but never claimed as device verified', () => {
  const installer = read(vmDir + 'VMHookInstaller.java')
  const hidden = read(vmDir + 'VMHiddenApi.java')
  const instrumentation = read(vmDir + 'HookInstrumentation.java')
  const attached = read(vmDir + 'AttachedInstrumentation.java')

  assert.ok(installer.includes('currentActivityThread'))
  assert.ok(installer.includes('IActivityManagerSingleton'))
  assert.ok(installer.includes('sPackageManager'))
  assert.ok(installer.includes('verifiedOnDevice'))
  assert.ok(installer.includes('HOOKS_ATTACHED_NOT_DEVICE_VERIFIED'))
  assert.ok(hidden.includes('setHiddenApiExemptions'))
  assert.ok(instrumentation.includes('loader.loadClass(target)'))
  assert.ok(attached.includes('public boolean isReady() { return true; }'))
})

test('hook controls are reachable from settings and the floating menu', () => {
  const settings = read('src/screens/Settings.jsx')
  const app = read('src/App.jsx')
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')

  assert.ok(settings.includes('native.vmAttach'))
  assert.ok(settings.includes('native.vmHooks'))
  assert.ok(settings.includes('Device verified:'))
  assert.ok(app.includes("command === 'vmAttach'"))
  assert.ok(app.includes("command === 'vmHooks'"))
  assert.ok(overlay.includes('Attach VM Hooks'))
  assert.ok(overlay.includes('VM Hook Status'))
})

test('VM controls are reachable from settings and the floating menu', () => {
  const settings = read('src/screens/Settings.jsx')
  const app = read('src/App.jsx')
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')

  assert.ok(settings.includes('VM Host (rootless) · step 2'))
  assert.ok(settings.includes('native.vmInstall'))
  assert.ok(settings.includes('native.vmLaunch'))
  assert.ok(app.includes("command === 'vmStatus'"))
  assert.ok(app.includes("command === 'vmStart'"))
  assert.ok(overlay.includes('VM Host Status'))
  assert.ok(overlay.includes('Start VM Host'))
  assert.ok(app.includes('onRequestNotifications={requestNotifications}'))
  assert.ok(app.includes('onRequestUsageAccess={requestUsage}'))
})
