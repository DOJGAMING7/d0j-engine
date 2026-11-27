import { getPref, setPref } from './storage.js'

export const PASS_SALT = 'd0j-engine-private-v2'
export const PASS_HASH = '25c481a44a455f6b66ef1fdc85616962b4b3d1e5f1ae91d160906aa0affd03ee'
const UNLOCK_KEY = 'apkUnlocked'

async function digest(text) {
  const bytes = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPass(input) {
  if (!input) return false
  const hash = await digest(PASS_SALT + String(input))
  return hash === PASS_HASH
}

export function isUnlocked() {
  return getPref(UNLOCK_KEY, false) === true
}

export function markUnlocked(value = true) {
  return setPref(UNLOCK_KEY, value === true)
}
