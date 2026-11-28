import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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

test('VM never auto-picks a Facebook/helper activity as the game launcher', () => {
  const core = read(vmDir + 'VMCore.java')
  const settings = read('src/screens/Settings.jsx')
  const provider = read(vmDir + 'SystemCallProvider.java')

  assert.ok(core.includes('chooseLaunchActivity('))
  assert.ok(core.includes('"facebook", "customtab", "custom_tab"'))
  assert.ok(core.includes('"launcheractivity", "splashactivity"'))
  assert.ok(!core.includes('entry.launchActivity.isEmpty() && (lower.contains("main")'))
  assert.ok(provider.includes('listing.put("apps", core.list())'))
  assert.ok(settings.includes('Activity override (optional)'))
  assert.ok(settings.includes('native.vmLaunch(GAME_PACKAGES.eightBallPool, vmActivity.trim())'))
  assert.ok(settings.includes('Auto activity:'))
})

test('VM stages the APK read-only before classloading', () => {
  const core = read(vmDir + 'VMCore.java')

  assert.ok(core.includes('Writable dex file'), 'documents the Android 10+ restriction')
  assert.ok(core.includes('private String stageApk('))
  assert.ok(core.includes('makeReadOnly('))
  assert.ok(core.includes('Os.chmod('))
  assert.ok(core.includes('new File(apkDir,'))
  assert.ok(core.includes('entry.apkPath = stageApk(file, info.packageName)'))
  assert.ok(core.includes('installedApk.canWrite()'), 'restages legacy writable entries')
  assert.ok(core.includes('new dalvik.system.DexClassLoader(\n                entry.apkPath'))
})

test('probe exposes real memory maps so no base address is guessed', () => {
  const provider = read(vmDir + 'VMMemoryProvider.java')
  const remote = read(vmDir + 'VMRemoteMemoryReader.java')
  const calls = read(vmDir + 'SystemCallProvider.java')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const settings = read('src/screens/Settings.jsx')

  assert.ok(provider.includes('"maps".equals(op)'))
  assert.ok(provider.includes('readMaps('))
  assert.ok(provider.includes('/proc/self/maps'))
  assert.ok(remote.includes('public String maps()'))
  assert.ok(calls.includes('"probeMaps".equals(op)'))
  assert.ok(plugin.includes('public void vmMaps(PluginCall call)'))
  assert.ok(nativeJs.includes('vmMaps:'))
  assert.ok(settings.includes('Show memory bases'))
  assert.ok(settings.includes('native.vmMaps()'))
  assert.ok(settings.includes('Real readable regions — select a base'))
})

test('APK is signed with a committed stable key so updates do not need uninstall', () => {
  const gradle = read('android/app/build.gradle')
  const manifest = read('android/app/src/main/AndroidManifest.xml')

  assert.ok(gradle.includes("storeFile file('d0j-debug.p12')"))
  assert.ok(gradle.includes('storeType \'PKCS12\''))
  assert.ok(gradle.includes('signingConfig signingConfigs.debug'))
  assert.ok(existsSync(resolve(root, 'android/app/d0j-debug.p12')))
  assert.ok(manifest.includes('REQUEST_INSTALL_PACKAGES'))
})

test('one-tap APK update downloads from GitHub and relaunches after install', () => {
  const nativeJs = read('src/lib/native.js')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const settings = read('src/screens/Settings.jsx')
  const home = read('src/screens/Home.jsx')

  assert.ok(nativeJs.includes('installApkFromUrl:'))
  assert.ok(plugin.includes('public void installApkFromUrl(PluginCall call)'))
  assert.ok(plugin.includes('ACTION_INSTALL_PACKAGE'))
  assert.ok(plugin.includes('handleApkInstallResult'))
  assert.ok(plugin.includes('getLaunchIntentForPackage(getContext().getPackageName())'))
  assert.ok(settings.includes('Download + Install + Restart'))
  assert.ok(settings.includes('installApkFromUrl(target)'))
  assert.ok(settings.includes('api.github.com/repos/DOJGAMING7/d0j-engine/releases'))
  assert.ok(home.includes('onStartSession(GAME_PACKAGES.eightBallPool)'))
})

test('no screen projection plan: no capture calls, no capture permission', () => {
  const nativeJs = read('src/lib/native.js')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const app = read('src/App.jsx')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')

  for (const method of ['startScreenCapture', 'readScreenState', 'stopScreenCapture']) {
    assert.ok(!nativeJs.includes(`${method}:`), `native.${method} must be removed`)
    assert.ok(!app.includes(`native.${method}()`), `app must not call ${method}`)
    assert.ok(!plugin.includes(`public void ${method}(PluginCall call)`), `plugin method ${method} must be removed`)
  }
  assert.ok(!app.includes('screenCaptureRef'))
  assert.ok(!app.includes('readScreenSnapshot'))
  assert.ok(!plugin.includes('MediaProjection'))
  assert.ok(!plugin.includes('ScreenBallDetector'))
  assert.ok(app.includes('VM state bridge'))
  assert.ok(app.includes('Line geometry'))
  assert.ok(app.includes('LOCAL PREVIEW: simulated state only · no screen capture'))
  assert.ok(app.includes('native.startSession({ packageName: pkg, launchGame: false })'))
  assert.ok(app.includes('await native.launchGame(pkg)'))
  assert.ok(manifest.includes('android:foregroundServiceType="specialUse"'))
  assert.ok(!manifest.includes('mediaProjection'), 'overlay FGS must not claim mediaProjection')
  assert.ok(!overlay.includes('FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION'))
})

test('crash diagnostics are saved locally and exposed in settings', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const appClass = read('android/app/src/main/java/com/d0j/engine/D0JApp.java')
  const prefs = read('android/app/src/main/java/com/d0j/engine/D0JPrefs.java')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const settings = read('src/screens/Settings.jsx')

  assert.ok(manifest.includes('android:name=".D0JApp"'))
  assert.ok(!manifest.includes('FOREGROUND_SERVICE_MEDIA_PROJECTION'), 'no system projection permission needed')
  assert.ok(appClass.includes('Thread.setDefaultUncaughtExceptionHandler'))
  assert.ok(appClass.includes('D0JPrefs.LAST_CRASH'))
  assert.ok(prefs.includes('LAST_CRASH'))
  assert.ok(plugin.includes('public void getLastCrash(PluginCall call)'))
  assert.ok(plugin.includes('public void clearLastCrash(PluginCall call)'))
  assert.ok(nativeJs.includes('getLastCrash:'))
  assert.ok(nativeJs.includes('clearLastCrash:'))
  assert.ok(settings.includes('COPY CRASH LOG'))
  assert.ok(settings.includes('native.clearLastCrash()'))
})

test('quick test reports the exact failed core step', () => {
  const app = read('src/App.jsx')
  assert.ok(app.includes('Quick test FAIL · core ${coreText} · ${firstFailed?.name || \'error\'}: ${String(firstFailed?.detail || \'\').slice(0, 80)}'))
  assert.ok(app.includes('Quick test PASS · core ${coreText}'))
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

test('APK picker avoids blocked shared-storage paths', () => {
  const nativeJs = read('src/lib/native.js')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const settings = read('src/screens/Settings.jsx')

  assert.ok(nativeJs.includes('pickApk:'))
  assert.ok(plugin.includes('public void pickApk(PluginCall call)'))
  assert.ok(plugin.includes('@ActivityCallback'))
  assert.ok(plugin.includes('ACTION_OPEN_DOCUMENT'))
  assert.ok(plugin.includes('vm-incoming.apk'))
  assert.ok(settings.includes('native.pickApk'))
  assert.ok(settings.includes('Pick + Install APK'))
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
