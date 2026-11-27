import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const updates = resolve(root, 'updates')
const zipPath = resolve(updates, 'ui-bundle.zip')
const manifestPath = resolve(updates, 'ui-manifest.json')

if (!existsSync(resolve(dist, 'index.html'))) throw new Error('dist/index.html missing; run npm run build first')
mkdirSync(updates, { recursive: true })
rmSync(zipPath, { force: true })
execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: dist, stdio: 'inherit' })

const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const manifest = {
  version: pkg.version,
  date: new Date().toISOString().slice(0, 10),
  bundle: 'ui-bundle.zip',
  sha256,
  notes: previous.notes || ['D0J EnGine UI bundle']
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote ${zipPath} (${sha256})`)
