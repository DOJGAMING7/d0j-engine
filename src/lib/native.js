import { Capacitor, registerPlugin } from '@capacitor/core'

const noopHandle = { remove: async () => {} }
const webFallback = {
  ping: async () => ({ ok: false, native: false }),
  hasOverlayPermission: async () => ({ granted: false }),
  requestOverlayPermission: async () => ({ ok: false, error: 'WEB_ONLY' }),
  startFloating: async () => ({ ok: false, error: 'WEB_ONLY' }),
  stopFloating: async () => ({ ok: false, error: 'WEB_ONLY' }),
  isFloatingActive: async () => ({ active: false }),
  launchGame: async packageName => ({ ok: false, error: 'WEB_ONLY', packageName }),
  openApp: async () => ({ ok: false, error: 'WEB_ONLY' }),
  isAccessibilityEnabled: async () => ({ enabled: false }),
  requestAccessibility: async () => ({ ok: false, error: 'WEB_ONLY' }),
  setGuards: async () => ({ ok: false, error: 'WEB_ONLY' }),
  getGuards: async () => ({ purchaseGuard: true, overlayGuard: true }),
  syncConfig: async () => ({ ok: false, error: 'WEB_ONLY' }),
  isUnlocked: async () => ({ unlocked: true }),
  setUnlocked: async () => ({ ok: false, error: 'WEB_ONLY' }),
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
  startFloating: () => call('startFloating'),
  stopFloating: () => call('stopFloating'),
  isFloatingActive: async () => {
    const res = await call('isFloatingActive')
    return { ...res, active: res?.active === true }
  },
  launchGame: packageName => call('launchGame', { packageName: String(packageName || '') }),
  openApp: () => call('openApp'),
  isAccessibilityEnabled: async () => {
    const res = await call('isAccessibilityEnabled')
    return { ...res, enabled: res?.enabled === true }
  },
  requestAccessibility: () => call('requestAccessibility'),
  setGuards: options => call('setGuards', options || {}),
  getGuards: () => call('getGuards'),
  syncConfig: config => call('syncConfig', config || {}),
  isUnlocked: async () => {
    const res = await call('isUnlocked')
    return { ...res, unlocked: res?.unlocked !== false }
  },
  setUnlocked: value => call('setUnlocked', { value: value === true }),
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
