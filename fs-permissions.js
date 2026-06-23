// scripts/skills/packaged/whatsapp/fs-permissions.js
// Mirror of apps/momai/src/main/security/fs-permissions.ts — kept as a plain
// CommonJS module so the worker (which can't load TypeScript) can use it.
// Keep the two implementations in sync; the only difference is the language.

const fs = require('fs')

function secureWriteFileSync(path, data) {
  fs.writeFileSync(path, data)
  try {
    fs.chmodSync(path, 0o600)
  } catch {
    // Windows doesn't honor Unix perms; rely on ACLs
  }
}

async function secureWriteFile(path, data) {
  await fs.promises.writeFile(path, data)
  try {
    fs.chmodSync(path, 0o600)
  } catch {}
}

module.exports = { secureWriteFileSync, secureWriteFile }
