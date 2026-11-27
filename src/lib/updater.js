import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { BlobReader, ZipReader, BlobWriter } from '@zip.js/zip.js'
import { getPref, setPref, removePref, KEYS } from './storage.js'

const isNative = () => Capacitor.isNativePlatform()
const BUNDLE_DIR = 'd0j-ui-bundle'

export async function getBundleMeta() {
  return await getPref(KEYS.uiBundleMeta, { version: null, lastChecked: null, lastApplied: null, serverUrl: '', sha256: null })
}

async function ensureDir(path = BUNDLE_DIR) {
  if (!isNative()) return
  try { await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true }) } catch {}
}

async function verifyBundle(blob, expected) {
  if (!expected || !globalThis.crypto?.subtle) return true
  const buf = await blob.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf)
  const actual = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  return actual === String(expected).toLowerCase()
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('read failed'))
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.includes(',') ? s.split(',')[1] : s)
    }
    r.readAsDataURL(blob)
  })
}

async function hasCachedBundle() {
  if (isNative()) {
    try {
      await Filesystem.stat({ path: `${BUNDLE_DIR}/index.html`, directory: Directory.Data })
      return true
    } catch { return false }
  }
  return !!getPref(KEYS.uiBundleCache, null)?.html
}

async function installBundle(blob, version, sha256) {
  const reader = new ZipReader(new BlobReader(blob))
  const entries = await reader.getEntries()

  if (!isNative()) {
    const htmlEntry = entries.find(e => e.filename === 'index.html' || e.filename.endsWith('/index.html'))
    const assets = {}
    for (const e of entries) {
      if (e.directory) continue
      const b = await e.getData(new BlobWriter())
      assets[e.filename] = await blobToBase64(b)
    }
    const html = htmlEntry ? await (await htmlEntry.getData(new BlobWriter('text/html'))).text() : ''
    setPref(KEYS.uiBundleCache, { version, sha256, html, assets })
    await reader.close()
    return
  }

  await ensureDir(BUNDLE_DIR)
  try {
    const dir = await Filesystem.readdir({ path: BUNDLE_DIR, directory: Directory.Data })
    for (const f of dir.files || []) {
      const name = f.name || f
      try { await Filesystem.deleteFile({ path: `${BUNDLE_DIR}/${name}`, directory: Directory.Data }) }
      catch { try { await Filesystem.rmdir({ path: `${BUNDLE_DIR}/${name}`, directory: Directory.Data, recursive: true }) } catch {} }
    }
  } catch {}

  for (const entry of entries) {
    if (entry.directory) { await ensureDir(`${BUNDLE_DIR}/${entry.filename}`); continue }
    const dataBlob = await entry.getData(new BlobWriter())
    const b64 = await blobToBase64(dataBlob)
    const path = `${BUNDLE_DIR}/${entry.filename}`.replace(/\/+/g, '/')
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent) await ensureDir(parent)
    await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true })
  }
  await reader.close()
}

export async function checkAndUpdateBundle(serverUrl) {
  const url = String(serverUrl || '').trim().replace(/\/$/, '')
  const meta = await getBundleMeta()
  if (!url) return { status: 'no-server', meta }

  try {
    const manifestRes = await fetch(`${url}/ui-manifest.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!manifestRes.ok) return { status: 'manifest-error', code: manifestRes.status, meta }
    const manifest = await manifestRes.json()
    const version = String(manifest.version || '').trim()
    if (!version) return { status: 'invalid-manifest', meta }

    if (meta.version === version && await hasCachedBundle()) {
      const next = { ...meta, lastChecked: Date.now(), serverUrl: url }
      setPref(KEYS.uiBundleMeta, next)
      return { status: 'up-to-date', version, meta: next, manifest }
    }

    const bundleName = String(manifest.bundle || 'ui-bundle.zip').trim()
    const bundleUrl = bundleName.startsWith('http') ? bundleName : `${url}/${bundleName.replace(/^\//, '')}`
    const bundleRes = await fetch(bundleUrl, { cache: 'no-store' })
    if (!bundleRes.ok) return { status: 'bundle-error', code: bundleRes.status, meta }
    const blob = await bundleRes.blob()
    if (!(await verifyBundle(blob, manifest.sha256))) return { status: 'hash-error', meta }

    await installBundle(blob, version, manifest.sha256)
    const next = { version, sha256: manifest.sha256 || null, lastChecked: Date.now(), lastApplied: Date.now(), serverUrl: url }
    setPref(KEYS.uiBundleMeta, next)
    return { status: 'updated', version, meta: next, manifest }
  } catch (e) {
    return { status: 'offline', error: String(e?.message || e), meta }
  }
}

export async function getCachedBundleUrl() {
  if (isNative()) {
    try {
      const uri = await Filesystem.getUri({ path: `${BUNDLE_DIR}/index.html`, directory: Directory.Data })
      return Capacitor.convertFileSrc(uri.uri)
    } catch { return null }
  }
  const cached = getPref(KEYS.uiBundleCache, null)
  if (!cached?.html) return null
  const html = rewriteCachedHtml(cached.html, cached.assets || {})
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
}

function rewriteCachedHtml(html, assets) {
  const map = {}
  for (const [name, b64] of Object.entries(assets)) {
    const clean = name.replace(/^\.\//, '')
    const mime = clean.endsWith('.css') ? 'text/css' : clean.endsWith('.js') ? 'text/javascript' : clean.endsWith('.png') ? 'image/png' : 'application/octet-stream'
    map[clean] = `data:${mime};base64,${b64}`
  }
  return html.replace(/(src|href)=["']\.\/([^"']+)["']/g, (m, attr, path) => map[path] ? `${attr}="${map[path]}"` : m)
}

export async function rollbackBundle() {
  if (isNative()) {
    try { await Filesystem.rmdir({ path: BUNDLE_DIR, directory: Directory.Data, recursive: true }) } catch {}
  }
  removePref(KEYS.uiBundleCache)
  setPref(KEYS.uiBundleMeta, { version: null, lastChecked: Date.now(), lastApplied: null, serverUrl: '', sha256: null })
  return { status: 'rolled-back' }
}
