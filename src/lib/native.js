import { Capacitor, registerPlugin } from '@capacitor/core'

const noopHandle = { remove: async () => {} }
const webFallback = {
  ping: async () => ({ ok: false, native: false }),
  hasOverlayPermission: async () => ({ granted: true, native: false }),
  requestOverlayPermission: async () => ({ ok: true, native: false }),
  startFloating: async () => ({ ok: false, error: 'WEB_ONLY' }),
  stopFloating: async () => ({ ok: false, error: 'WEB_ONLY' }),
  isFloatingActive: async () => ({ active: false, sessionActive: false }),
  launchGame: async packageName => ({ ok: false, error: 'WEB_ONLY', packageName }),
  openApp: async () => ({ ok: false, error: 'WEB_ONLY' }),
  syncConfig: async () => ({ ok: true, native: false }),
  isUnlocked: async () => ({ unlocked: true }),
  setUnlocked: async () => ({ ok: true, native: false }),
  startSession: async () => ({ ok: false, error: 'WEB_ONLY' }),
  stopSession: async () => ({ ok: false, error: 'WEB_ONLY' }),
  getSessionStatus: async () => ({ active: false, sessionActive: false }),
  showNotification: async () => ({ ok: true, native: false }),
  showToast: async () => ({ ok: true, native: false }),
  hasNotificationPermission: async () => ({ granted: true }),
  requestNotificationPermission: async () => ({ granted: true }),
  hasUsageAccess: async () => ({ granted: false }),
  requestUsageAccess: async () => ({ ok: false }),
  vmStatus: async () => ({ ok: false, ready: false, state: 'WEB_ONLY', reason: 'WEB_ONLY' }),
  vmSessionWatch: async () => ({ ok: false, verdict: 'UNKNOWN', evidence: 'NONE', state: 'WEB_ONLY' }),
  setOverlayLines: async () => ({ ok: false, error: 'WEB_ONLY' }),
  clearOverlayLines: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmState: async () => ({ ok: false, complete: false, state: 'WEB_ONLY', provider: 'web' }),
  vmStateProvider: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmBindings: async () => ({ ok: false, status: 'UNMEASURED' }),
  vmSaveBindings: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmProbe: async () => ({ ok: false, attached: false, reason: 'WEB_ONLY' }),
  vmMaps: async () => ({ ok: false, maps: [], reason: 'WEB_ONLY' }),
  vmAttachReader: async () => ({ ok: false, attached: false, reason: 'WEB_ONLY' }),
  vmAttachInput: async () => ({ ok: false, ready: false, reason: 'WEB_ONLY' }),
  vmInputStatus: async () => ({ ok: false, ready: false, reason: 'WEB_ONLY' }),
  vmInputTap: async () => ({ ok: false, injected: false, reason: 'WEB_ONLY' }),
  vmInputSwipe: async () => ({ ok: false, injected: false, reason: 'WEB_ONLY' }),
  vmInputPath: async () => ({ ok: false, injected: false, reason: 'WEB_ONLY' }),
  vmHooks: async () => ({ ok: false, ready: false, state: 'WEB_ONLY', reason: 'WEB_ONLY' }),
  vmAttach: async () => ({ ok: false, ready: false, state: 'WEB_ONLY', reason: 'WEB_ONLY' }),
  vmList: async () => ({ ok: false, apps: [] }),
  pickApk: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmInstall: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmLaunch: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmStopApp: async () => ({ ok: false, error: 'WEB_ONLY' }),
  vmDaemon: async () => ({ ok: false, error: 'WEB_ONLY' }),
  addListener: async () => noopHandle
}

const plugin = registerPlugin('D0JNative', webFallback)

const call = async (method, ...args) => {
  try {
    return await plugin[method](...args)
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

const native = {
  plugin,
  isNative: () => Capacitor.isNativePlatform(),
  ping: () => call('ping'),
  hasOverlayPermission: async () => {
    if (!Capacitor.isNativePlatform()) return { granted: true, native: false }
    const res = await call('hasOverlayPermission')
    return { ...res, granted: res?.granted === true }
  },
  requestOverlayPermission: () => call('requestOverlayPermission'),
  startFloating: options => call('startFloating', options || {}),
  stopFloating: () => call('stopFloating'),
  startSession: options => call('startSession', options || {}),
  stopSession: () => call('stopSession'),
  isFloatingActive: async () => {
    const res = await call('isFloatingActive')
    return { ...res, active: res?.active === true, sessionActive: res?.sessionActive === true }
  },
  getSessionStatus: async () => {
    const res = await call('getSessionStatus')
    return { ...res, active: res?.active === true, sessionActive: res?.sessionActive === true }
  },
  launchGame: packageName => call('launchGame', { packageName: String(packageName || '') }),
  openApp: () => call('openApp'),
  syncConfig: config => call('syncConfig', config || {}),
  isUnlocked: async () => {
    const res = await call('isUnlocked')
    return { ...res, unlocked: res?.unlocked !== false }
  },
  setUnlocked: value => call('setUnlocked', { value: value === true }),
  showNotification: payload => call('showNotification', payload || {}),
  showToast: payload => call('showToast', payload || {}),
  hasNotificationPermission: async () => { const r = await call('hasNotificationPermission'); return { ...r, granted: r?.granted === true } },
  requestNotificationPermission: async () => { const r = await call('requestNotificationPermission'); return { ...r, granted: r?.granted === true } },
  hasUsageAccess: async () => { const r = await call('hasUsageAccess'); return { ...r, granted: r?.granted === true } },
  requestUsageAccess: () => call('requestUsageAccess'),
  vmStatus: () => call('vmStatus'),
  vmSessionWatch: () => call('vmSessionWatch'),
  setOverlayLines: specs => call('setOverlayLines', { json: typeof specs === 'string' ? specs : JSON.stringify(specs || {}) }),
  clearOverlayLines: () => call('clearOverlayLines'),
  vmState: () => call('vmState'),
  vmStateProvider: name => call('vmStateProvider', { name: name || 'demo' }),
  vmBindings: () => call('vmBindings'),
  vmSaveBindings: json => call('vmSaveBindings', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),
  vmProbe: options => call('vmProbe', options || {}),
  vmMaps: () => call('vmMaps'),
  vmAttachReader: process => call('vmAttachReader', { process: Number(process) || 0 }),
  vmAttachInput: process => call('vmAttachInput', { process: Number(process) || 0 }),
  vmInputStatus: () => call('vmInputStatus'),
  vmInputTap: (x, y) => call('vmInputTap', { x: Number(x) || 0, y: Number(y) || 0 }),
  vmInputPath: path => call('vmInputPath', { json: typeof path === 'string' ? path : JSON.stringify(path || {}) }),
  vmInputSwipe: swipe => call('vmInputSwipe', {
    x1: Number(swipe?.x1) || 0,
    y1: Number(swipe?.y1) || 0,
    x2: Number(swipe?.x2) || 0,
    y2: Number(swipe?.y2) || 0,
    duration: Number(swipe?.duration) || 180
  }),
  vmHooks: () => call('vmHooks'),
  vmAttach: () => call('vmAttach'),
  vmList: () => call('vmList'),
  pickApk: () => call('pickApk'),
  vmInstall: apkPath => call('vmInstall', { apkPath: String(apkPath || '') }),
  vmLaunch: (packageName, activityName) => call('vmLaunch', {
    packageName: String(packageName || ''),
    activityName: String(activityName || '')
  }),
  vmStopApp: packageName => call('vmStopApp', { packageName: String(packageName || '') }),
  vmDaemon: start => call('vmDaemon', { start: start !== false }),
  addListener: (eventName, listener) => {
    if (!Capacitor.isNativePlatform()) return Promise.resolve(noopHandle)
    try {
      const handle = plugin.addListener(eventName, listener)
      return handle && typeof handle.then === 'function'
        ? handle.catch(() => noopHandle)
        : Promise.resolve(handle || noopHandle)
    } catch {
      return Promise.resolve(noopHandle)
    }
  }
}

export default native
