// scripts/skills/packaged/whatsapp/secure-storage-bridge.js
// Bridge between the WhatsApp worker (subprocess of node-core) and the OS
// keychain (safeStorage) which lives in the Electron main process.
//
// Flow:
//   worker (background-worker.js)
//     → process.send({ type: 'secure-storage:encrypt', requestId, payload })
//   host (extension-host-manager.js) forwards to main
//     → process.send({ type: 'secure-storage:encrypt', requestId, payload })
//   main (coreManager.ts) calls safeStorage.encryptString(...)
//     → child.send({ type: 'secure-storage:encrypt-result', requestId, ack })
//   host forwards back to worker
//     → child.send({ type: 'secure-storage:encrypt-result', requestId, ack })
//   bridge resolves the matching pending promise.
//
// On any failure (timeout, host unavailable, safeStorage unavailable) we
// resolve to null so the caller can fall back to plain text + warn.

const SECURE_STORAGE_TIMEOUT_MS = 5000

const pending = new Map()
let nextId = 1

if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (
      msg.type === 'secure-storage:encrypt-result' ||
      msg.type === 'secure-storage:decrypt-result'
    ) {
      const handler = pending.get(msg.requestId)
      if (handler) {
        pending.delete(msg.requestId)
        clearTimeout(handler.timeout)
        handler.resolve(msg.ack || null)
      }
    }
  })
}

function _request(requestType, payload) {
  return new Promise((resolve) => {
    if (typeof process === 'undefined' || typeof process.send !== 'function') {
      resolve(null)
      return
    }
    const requestId = `sstorage-${nextId++}-${Date.now()}`
    const timeout = setTimeout(() => {
      pending.delete(requestId)
      resolve(null)
    }, SECURE_STORAGE_TIMEOUT_MS)
    pending.set(requestId, { resolve, timeout })
    try {
      process.send({ type: requestType, requestId, payload })
    } catch {
      pending.delete(requestId)
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

/**
 * Encrypt a plaintext string. Returns base64-encoded ciphertext, or null on failure/timeout.
 */
async function encryptForStorage(plain) {
  const ack = await _request('secure-storage:encrypt', { plain })
  return ack && ack.ok ? ack.encrypted : null
}

/**
 * Decrypt a base64-encoded ciphertext. Returns plaintext, or null on failure/timeout.
 */
async function decryptFromStorage(encryptedBase64) {
  const ack = await _request('secure-storage:decrypt', { encryptedBase64 })
  return ack && ack.ok ? ack.plain : null
}

module.exports = { encryptForStorage, decryptFromStorage }
