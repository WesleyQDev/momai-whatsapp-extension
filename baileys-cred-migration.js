// scripts/skills/packaged/whatsapp/baileys-cred-migration.js
// Migrate Baileys `creds.json` to/from `creds.json.enc` so Signal protocol keys
// are encrypted at rest with the OS keychain (via the secure-storage bridge).
//
// Trade-off (v1): Baileys still needs `creds.json` on disk during its run, so we
// decrypt to plain at startup and re-encrypt when the connection opens (or
// `request_qr` triggers a logout/clear). Plain is on disk only between those
// two events.

const fs = require('fs')
const path = require('node:path')
const {
  encryptForStorage,
  decryptFromStorage
} = require('./secure-storage-bridge')
const { secureWriteFileSync } = require('./fs-permissions')

function _plainCredsPath(baseAuth) {
  return path.join(baseAuth, 'creds.json')
}
function _encCredsPath(baseAuth) {
  return path.join(baseAuth, 'creds.json.enc')
}

/**
 * Factory: build a migration triple bound to a specific bridge.
 * Tests inject a mock bridge; production code uses the default export
 * (which is pre-bound to the real bridge).
 */
function createMigration(bridge) {
  return {
    /**
     * One-time migration: encrypt any legacy `creds.json` to `creds.json.enc` and remove the plain file.
     * Also re-encrypts when `creds.json.enc` exists but is older than `creds.json` — that means
     * Baileys updated the plain file after the last re-encrypt (e.g. user closed the app while
     * connected, before the post-close re-encrypt completed) and the .enc on disk is stale.
     * Returns true when a (re-)encryption was performed, false otherwise.
     */
    async migratePlainCredsToEncrypted(baseAuth) {
      const plainCreds = _plainCredsPath(baseAuth)
      const encCreds = _encCredsPath(baseAuth)
      if (fs.existsSync(plainCreds)) {
        let shouldMigrate = false
        if (!fs.existsSync(encCreds)) {
          shouldMigrate = true
        } else {
          try {
            const plainStat = fs.statSync(plainCreds)
            const encStat = fs.statSync(encCreds)
            if (plainStat.mtimeMs > encStat.mtimeMs) {
              shouldMigrate = true
            }
          } catch {
            shouldMigrate = true
          }
        }
        if (shouldMigrate) {
          const plain = fs.readFileSync(plainCreds, 'utf-8')
          const encrypted = await bridge.encryptForStorage(plain)
          if (encrypted) {
            secureWriteFileSync(encCreds, Buffer.from(encrypted, 'base64'))
            fs.unlinkSync(plainCreds)
            console.log('[whatsapp] (re-)encrypted creds.json → creds.json.enc')
            return true
          }
          console.warn('[whatsapp] migration skipped: safeStorage unavailable')
        }
      }
      return false
    },

    /**
     * On worker startup, decrypt `creds.json.enc` to `creds.json` so Baileys can use it.
     * Only writes if the plain file is missing (i.e., we just started and Baileys isn't running).
     * Returns true when a decryption+write happened, false otherwise.
     */
    async decryptCredsForBaileys(baseAuth) {
      const encCreds = _encCredsPath(baseAuth)
      const plainCreds = _plainCredsPath(baseAuth)
      if (fs.existsSync(encCreds) && !fs.existsSync(plainCreds)) {
        const encrypted = fs.readFileSync(encCreds).toString('base64')
        const plain = await bridge.decryptFromStorage(encrypted)
        if (plain) {
          secureWriteFileSync(plainCreds, plain, 'utf-8')
          console.log('[whatsapp] decrypted creds.json.enc → creds.json for runtime')
          return true
        }
        console.warn('[whatsapp] failed to decrypt creds.json.enc, safeStorage unavailable?')
      }
      return false
    },

    /**
     * Re-encrypt `creds.json` back to `creds.json.enc` and remove the plain file.
     * Call this on connection.open (or on shutdown) so at-rest storage stays encrypted.
     * Returns true when a re-encryption happened, false otherwise.
     */
    async reEncryptCredsAfterBaileys(baseAuth) {
      const plainCreds = _plainCredsPath(baseAuth)
      const encCreds = _encCredsPath(baseAuth)
      if (fs.existsSync(plainCreds)) {
        const plain = fs.readFileSync(plainCreds, 'utf-8')
        const encrypted = await bridge.encryptForStorage(plain)
        if (encrypted) {
          secureWriteFileSync(encCreds, Buffer.from(encrypted, 'base64'))
          fs.unlinkSync(plainCreds)
          console.log('[whatsapp] re-encrypted creds.json → creds.json.enc')
          return true
        }
        console.warn('[whatsapp] re-encryption skipped: safeStorage unavailable')
      }
      return false
    }
  }
}

// Default export: production migration pre-bound to the real bridge.
// Callers (e.g. background-worker.js) can still destructure the three
// migration functions directly from this default export.
module.exports = createMigration({ encryptForStorage, decryptFromStorage })

// Also export the factory so tests can inject a mock bridge.
module.exports.createMigration = createMigration
