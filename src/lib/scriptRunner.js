// Scripts ship inside the APK. These helpers only ever read their own local
// asset copy; a remote base is rejected so offline mode cannot silently turn
// into a runtime script download.
const localBase = base => {
  const value = String(base || 'scripts').trim()
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || value.includes('..')) {
    throw new Error('remote script source blocked')
  }
  return value
}

export async function loadScriptEntries(base = 'scripts') {
  const res = await fetch(`${localBase(base)}/index.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`script index HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.scripts) ? data.scripts : []
}

export async function loadScriptSource(file, base = 'scripts') {
  const clean = String(file || '').replace(/^\/+/, '')
  if (clean.includes('..') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(clean)) {
    throw new Error('remote script source blocked')
  }
  const res = await fetch(`${localBase(base)}/${clean}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`script HTTP ${res.status}`)
  return await res.text()
}

export async function runScriptSource(source, api, log) {
  const cleaned = String(source || '').replace(/^\s*export\s+default\s+/, '').trim()
  if (!cleaned) throw new Error('empty script')
  const factory = new Function(
    'api', 'log', 'window', 'document', 'fetch', 'XMLHttpRequest', 'console',
    `return (${cleaned});`
  )
  const fn = factory(api, log, undefined, undefined, undefined, undefined, { log })
  if (typeof fn !== 'function') throw new Error('script must export a function')
  return await fn(api, log)
}
