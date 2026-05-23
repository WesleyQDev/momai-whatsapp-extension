// scripts/skills/packaged/whatsapp/background-worker.js
// Persistent worker for WhatsApp Web connection via Baileys

const MAX_HISTORY = 50
const MAX_PERSISTED_CONVERSATIONS = 3
const CHAT_HISTORY_KEY = 'chat_history'

let makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  pino
try {
  const baileys = require('@whiskeysockets/baileys')
  makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket
  useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState
  DisconnectReason = baileys.DisconnectReason
  fetchLatestBaileysVersion =
    baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion
  makeCacheableSignalKeyStore =
    baileys.makeCacheableSignalKeyStore || baileys.default?.makeCacheableSignalKeyStore

  try {
    pino = require('pino')
  } catch (e) {
    // pino not found
  }

  process.send({ type: 'log', message: 'Baileys loaded successfully' })
} catch (err) {
  process.send({ type: 'log', message: `Baileys load error: ${err.message}` })
  process.exit(1)
}
const path = require('path')
const fs = require('node:fs/promises')

// Crash protection — log instead of exiting on unhandled errors
process.on('uncaughtException', (err) => {
  try {
    process.send({ type: 'log', message: `UNCAUGHT: ${err.message}` })
  } catch {}
})
process.on('unhandledRejection', (err) => {
  try {
    process.send({ type: 'log', message: `UNHANDLED: ${(err && err.message) || err}` })
  } catch {}
})

const DISABLED_CONTACTS_KEY = 'disabled_contacts'
const CONTACT_NAMES_KEY = 'contact_names'
const WA_CONTACTS_KEY = 'wa_contacts'
const CHECK_INTERVAL = 5000

// Self-contained momai bridge (not loaded via extension-host-worker)
const _skillId = process.env.MOMAI_EXTENSION_ID || 'whatsapp'
const _dataDir =
  process.env.MOMAI_DATA_DIR ||
  process.env.MOMAI_NODE_CORE_DATA_DIR ||
  path.resolve(__dirname, '..', '..', '..', '..', 'data')
const _storageBase = path.join(_dataDir, 'extensions', _skillId)

const momai = {
  log: (msg) => process.send({ type: 'log', message: String(msg) }),
  sendEvent: (eventType, data) =>
    process.send({ type: 'event', eventType: String(eventType), data }),
  sendStructuredResponse: (data) => process.send({ type: 'structured_response', data }),
  storage: {
    storageDir: _storageBase,
    async get(key) {
      try {
        const content = await fs.readFile(path.join(_storageBase, `${key}.json`), 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    },
    async set(key, value) {
      await fs.mkdir(_storageBase, { recursive: true })
      const serialized = JSON.stringify(value, null, 2)
      if (serialized.length > 5 * 1024 * 1024) throw new Error('Storage quota exceeded')
      await fs.writeFile(path.join(_storageBase, `${key}.json`), serialized, 'utf-8')
    }
  }
}



class MessageRetryCache {
  constructor() {
    this.store = new Map()
  }
  get(key) {
    return this.store.get(key)
  }
  set(key, value) {
    this.store.set(key, value)
  }
  del(key) {
    this.store.delete(key)
  }
  delete(key) {
    this.store.delete(key)
  }
  has(key) {
    return this.store.has(key)
  }
}
const msgRetryCounterCache = new MessageRetryCache()
const sentMessagesCache = new Map()
/** Full message protos keyed by remoteJid:messageId for Baileys retries/decrypt */
const messageStore = new Map()
/** @type {Map<string, { data: object, fetchedAt: number }>} */
const groupMetaCache = new Map()

let sock = null
let preventAutoReconnect = false
let disabledContacts = []
let contactNames = {}
let waContacts = {}
let connected = false
let chatHistory = []
let totalMessages = 0
let _currentPhone = null
let receivedJids = new Set()

function _messageCacheKey(key) {
  if (!key?.id) return null
  return `${key.remoteJid || ''}:${key.id}`
}

function _trimMessageCaches() {
  if (sentMessagesCache.size > 5000) {
    const firstKey = sentMessagesCache.keys().next().value
    sentMessagesCache.delete(firstKey)
  }
  if (messageStore.size > 5000) {
    const firstKey = messageStore.keys().next().value
    messageStore.delete(firstKey)
  }
}

function cacheMessage(key, message) {
  if (!key?.id || !message) return
  sentMessagesCache.set(key.id, message)
  const composite = _messageCacheKey(key)
  if (composite) messageStore.set(composite, message)
  _trimMessageCaches()
}

/**
 * Stale sender-key-memory makes Baileys skip SKDM distribution → "Aguardando mensagem" in groups.
 */
async function resetGroupSenderKeyMemory(groupJid) {
  if (!groupJid?.endsWith('@g.us')) return

  const fsSync = require('fs')
  const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
  const memFile = path.join(authDir, `sender-key-memory-${groupJid}.json`)

  try {
    if (fsSync.existsSync(memFile)) {
      fsSync.unlinkSync(memFile)
      momai.log(`Cleared sender-key-memory for ${groupJid}`)
    }
  } catch (e) {
    momai.log(`Failed to clear sender-key-memory file: ${e.message}`)
  }

  if (sock?.authState?.keys?.set) {
    try {
      await sock.authState.keys.set({ 'sender-key-memory': { [groupJid]: {} } })
    } catch (e) {
      momai.log(`Failed to reset in-memory sender-key-memory: ${e.message}`)
    }
  }
}

function isSenderKeyMemoryStale(groupJid, participantIds) {
  if (!participantIds?.length) return false

  const fsSync = require('fs')
  const memFile = path.join(
    momai.storage.storageDir,
    'baileys-auth',
    `sender-key-memory-${groupJid}.json`
  )
  if (!fsSync.existsSync(memFile)) return true

  try {
    const mem = JSON.parse(fsSync.readFileSync(memFile, 'utf-8'))
    const marked = Object.keys(mem).filter((k) => mem[k])
    if (marked.length === 0) return true

    const participantBases = new Set(
      participantIds.map((p) => (p || '').split('@')[0].split(':')[0]).filter(Boolean)
    )
    if (participantBases.size === 0) return false

    let covered = 0
    for (const base of participantBases) {
      if (marked.some((m) => m.split('@')[0].split(':')[0] === base)) covered++
    }
    return covered < Math.ceil(participantBases.size * 0.4)
  } catch {
    return true
  }
}

async function prepareGroupForSend(groupJid) {
  if (!sock || !connected) return

  let meta
  try {
    meta = await Promise.race([
      sock.groupMetadata(groupJid),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ])
    groupMetaCache.set(groupJid, { data: meta, fetchedAt: Date.now() })
  } catch (e) {
    momai.log(`prepareGroupForSend metadata: ${e.message}`)
    return
  }

  const participantIds = meta?.participants?.map((p) => p.id) || []
  if (isSenderKeyMemoryStale(groupJid, participantIds)) {
    momai.log(
      `prepareGroupForSend: stale sender-key-memory for ${groupJid} (${participantIds.length} participants)`
    )
    await resetGroupSenderKeyMemory(groupJid)
  }
}

function _getDisabledContactsKey() {
  return _currentPhone ? `disabled_contacts-${_currentPhone}` : DISABLED_CONTACTS_KEY
}

function _getContactNamesKey() {
  return _currentPhone ? `contact_names-${_currentPhone}` : CONTACT_NAMES_KEY
}

function _getWaContactsKey() {
  return _currentPhone ? `wa_contacts-${_currentPhone}` : WA_CONTACTS_KEY
}

function _getChatHistoryKey() {
  return _currentPhone ? `${CHAT_HISTORY_KEY}-${_currentPhone}` : CHAT_HISTORY_KEY
}

function buildPersistedHistorySnapshot(limit = MAX_PERSISTED_CONVERSATIONS) {
  if (chatHistory.length === 0) return []

  const latestByJid = new Map()
  for (const m of chatHistory) {
    const ts = Number(m.timestamp) || 0
    const prev = latestByJid.get(m.jid) || 0
    if (ts > prev) latestByJid.set(m.jid, ts)
  }

  const keepJids = new Set(
    [...latestByJid.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([jid]) => jid)
  )

  return chatHistory.filter((m) => keepJids.has(m.jid))
}

/** Grava em disco as 3 conversas mais recentes sem alterar o historico em memoria. */
async function persistChatHistorySnapshot() {
  try {
    const snapshot = buildPersistedHistorySnapshot()
    if (snapshot.length === 0) return
    await momai.storage.set(_getChatHistoryKey(), snapshot)
  } catch (e) {
    momai.log(`persistChatHistorySnapshot: ${e.message}`)
  }
}

/** Ao fechar o app: grava snapshot e alinha memoria ao que foi salvo. */
async function flushPersistedChatHistory() {
  if (chatHistory.length === 0) return
  try {
    chatHistory = buildPersistedHistorySnapshot()
    await momai.storage.set(_getChatHistoryKey(), chatHistory)
  } catch (e) {
    momai.log(`flushPersistedChatHistory: ${e.message}`)
  }
}

async function loadChatHistory() {
  if (chatHistory.length > 0) return true
  try {
    const keys = [...new Set([_currentPhone ? _getChatHistoryKey() : null, CHAT_HISTORY_KEY].filter(Boolean))]
    for (const key of keys) {
      const saved = await momai.storage.get(key)
      if (!Array.isArray(saved) || saved.length === 0) continue
      chatHistory = saved
      totalMessages = Math.max(totalMessages, chatHistory.length)
      momai.log(`loadChatHistory: ${saved.length} msgs from ${key}`)
      return true
    }
  } catch (e) {
    momai.log(`loadChatHistory: ${e.message}`)
  }
  return false
}

let _persistHistoryTimer = null
function schedulePersistChatHistory() {
  if (_persistHistoryTimer) clearTimeout(_persistHistoryTimer)
  _persistHistoryTimer = setTimeout(() => {
    _persistHistoryTimer = null
    persistChatHistorySnapshot().catch(() => {})
  }, 2000)
}

function resolveStandardJid(jid) {
  if (!jid) return null
  if (jid.endsWith('@lid')) {
    const matched = Object.values(waContacts).find((c) => c.lid === jid)
    if (matched && matched.id) {
      return matched.id
    }
  }
  return jid
}

function resolveContactName(jid) {
  if (!jid) return ''

  if (jid.endsWith('@lid')) {
    const matched = Object.values(waContacts).find((c) => c.lid === jid)
    if (matched) {
      return resolveContactName(matched.id)
    }
  }

  const rawNumber = (jid || '').split('@')[0] || jid

  if (contactNames[jid]) return contactNames[jid]
  if (contactNames[rawNumber]) return contactNames[rawNumber]

  const digitsOnly = rawNumber.replace(/\D/g, '')
  for (const key of Object.keys(contactNames)) {
    const keyDigits = String(key).replace(/\D/g, '')
    if (keyDigits && (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))) {
      return contactNames[key]
    }
  }

  const wc = waContacts[jid]
  if (wc) return wc.name || wc.notify || wc.verifiedName || rawNumber

  for (const [key, contact] of Object.entries(waContacts)) {
    const keyDigits = key.split('@')[0].replace(/\D/g, '')
    if (keyDigits && (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))) {
      return contact.name || contact.notify || contact.verifiedName || rawNumber
    }
  }

  return rawNumber
}

function getStoredAvatarUrl(jid) {
  if (!jid || !waContacts[jid]) return null
  return waContacts[jid].profilePicUrl || null
}

function resolveChatAvatarUrl(jid, isGroup, senderJid) {
  if (!jid) return null
  if (isGroup || jid.endsWith('@g.us')) {
    return getStoredAvatarUrl(jid)
  }
  return getStoredAvatarUrl(jid) || (senderJid ? getStoredAvatarUrl(senderJid) : null)
}

async function ensureAvatarForJid(jid) {
  if (!jid) return null

  const cached = getStoredAvatarUrl(jid)
  if (!sock || !connected) return cached

  if (!waContacts[jid]) {
    if (jid.endsWith('@g.us')) {
      waContacts[jid] = {
        id: jid,
        name: 'Grupo',
        phone: jid.split('@')[0]
      }
    } else if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')) {
      waContacts[jid] = {
        id: jid,
        name: resolveContactName(jid),
        phone: jid.split('@')[0]
      }
    } else {
      return cached
    }
  }

  const entry = waContacts[jid]
  const now = Date.now()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const RETRY_DELAY = 10 * 60 * 1000
  const lastChecked = entry.profilePicCheckedAt || 0
  const isFailedRecently = !entry.profilePicUrl && now - lastChecked < RETRY_DELAY
  const isSuccessRecently = entry.profilePicUrl && now - lastChecked < ONE_DAY

  if (cached && (isSuccessRecently || isFailedRecently)) {
    return entry.profilePicUrl || null
  }

  try {
    const url = await Promise.race([
      sock.profilePictureUrl(jid, 'image'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    entry.profilePicUrl = url
    entry.profilePicCheckedAt = now
    await momai.storage.set(_getWaContactsKey(), waContacts)
    return url
  } catch {
    entry.profilePicCheckedAt = now - ONE_DAY + RETRY_DELAY
    await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
    return entry.profilePicUrl || null
  }
}

function _isContactDisabled(jid) {
  const rawNumber = (jid || '').split('@')[0] || jid
  const digitsOnly = rawNumber.replace(/\D/g, '')
  return disabledContacts.some((d) => {
    const dDigits = String(d).replace(/\D/g, '')
    return (
      d === jid ||
      d === rawNumber ||
      (dDigits && digitsOnly && (dDigits.endsWith(digitsOnly) || digitsOnly.endsWith(dDigits)))
    )
  })
}

function _cleanupStaleContacts() {
  let changed = false
  const standardLids = new Set(
    Object.values(waContacts)
      .filter((c) => c.id && !c.id.endsWith('@lid') && c.lid)
      .map((c) => c.lid)
  )

  for (const key of Object.keys(waContacts)) {
    if (key.endsWith('@lid')) {
      const contact = waContacts[key]
      const hasName = contact.name || contact.verifiedName || contact.notify
      if (standardLids.has(key) || !hasName) {
        delete waContacts[key]
        changed = true
        delete contactNames[key]
        const rawNumber = key.split('@')[0]
        if (rawNumber) {
          delete contactNames[rawNumber]
        }
      }
    }
  }
  return changed
}

async function _loadPerPhoneData() {
  try {
    const credsPath = path.join(momai.storage.storageDir, 'baileys-auth', 'creds.json')
    const content = await fs.readFile(credsPath, 'utf-8')
    const creds = JSON.parse(content)
    if (creds.me?.id) {
      const phone = creds.me.id.split(':')[0].replace(/\D/g, '')
      if (!phone) return
      _currentPhone = phone
      const dc = await momai.storage.get(_getDisabledContactsKey())
      if (dc) disabledContacts = dc
      const pn = await momai.storage.get(_getContactNamesKey())
      if (pn) contactNames = pn
      const wc = await momai.storage.get(_getWaContactsKey())
      if (wc) waContacts = wc

      if (_cleanupStaleContacts()) {
        await momai.storage.set(_getWaContactsKey(), waContacts)
        await momai.storage.set(_getContactNamesKey(), contactNames)
        momai.log('Automatically cleaned up stale @lid contacts from phone storage')
      }

      await loadChatHistory()
    }
  } catch {
    momai.log('_loadPerPhoneData: no creds.json (fresh start)')
  }
}

async function main() {
  // Load whitelist (generic fallback)
  disabledContacts = (await momai.storage.get(DISABLED_CONTACTS_KEY)) || []
  contactNames = (await momai.storage.get(CONTACT_NAMES_KEY)) || {}
  waContacts = (await momai.storage.get(WA_CONTACTS_KEY)) || {}

  // Try to load per-phone data from existing creds (includes chat history)
  await _loadPerPhoneData()
  if (!chatHistory.length) {
    await loadChatHistory()
  }

  if (_cleanupStaleContacts()) {
    await momai.storage.set(WA_CONTACTS_KEY, waContacts)
    await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
    momai.log('Automatically cleaned up stale @lid contacts from fallback storage')
  }

  // Start connection
  await connect()

  setInterval(() => {
    persistChatHistorySnapshot().catch(() => {})
  }, 30000)

  process.send({ type: 'ready' })
  if (chatHistory.length > 0) {
    momai.sendEvent('history_loaded', { count: chatHistory.length })
  }

  // Periodic heartbeat — keeps SSE clients aware of current state
  setInterval(() => {
    momai.sendEvent('connection_status', { status: connected ? 'connected' : 'disconnected' })
  }, 15000)
}

async function connect() {
  try {
    receivedJids.clear()
    const { version } = await fetchLatestBaileysVersion()
    const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
    const hasCreds = require('fs').existsSync(path.join(authDir, 'creds.json'))
    momai.log(`connect: creds.json=${hasCreds}`)
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    // Setup logger with pino or fallback, redirecting warning/error events to momai.log
    let logger
    if (pino) {
      logger = pino({ level: 'warn' }, {
        write: (msg) => {
          try {
            const parsed = JSON.parse(msg)
            let levelStr = 'WARN'
            if (parsed.level >= 50) levelStr = 'ERROR'
            const detail = parsed.err?.message || parsed.error || ''
            momai.log(`[Baileys:${levelStr}] ${parsed.msg} ${detail ? '(' + detail + ')' : ''}`)
          } catch {
            momai.log(`[Baileys] ${msg}`)
          }
        }
      })
    } else {
      const makeMockLogger = () => {
        const mock = {
          info: () => {},
          debug: () => {},
          warn: (obj, msg) => momai.log(`[Baileys:WARN] ${msg || JSON.stringify(obj)}`),
          error: (obj, msg) => momai.log(`[Baileys:ERROR] ${msg || JSON.stringify(obj)}`),
          trace: () => {},
          child: () => mock
        }
        return mock
      }
      logger = makeMockLogger()
    }

    // Use the raw keys directly from disk (disabling cache to prevent Bad MAC and No Sessions out-of-sync desyncs)
    const authConfig = state

    sock = makeWASocket({
      version,
      auth: authConfig,
      logger,
      printQRInTerminal: false,
      emitOwnEvents: false,
      generateHighQualityLinkPreview: false,
      msgRetryCounterCache,
      cachedGroupMetadata: async (jid) => {
        const entry = groupMetaCache.get(jid)
        if (entry && Date.now() - entry.fetchedAt < 5 * 60 * 1000) {
          return entry.data
        }
        return undefined
      },
      getMessage: async (key) => {
        if (!key?.id) return { conversation: '' }
        const composite = _messageCacheKey(key)
        if (composite && messageStore.has(composite)) {
          return messageStore.get(composite)
        }
        const cached = sentMessagesCache.get(key.id)
        if (cached) return cached
        // Empty proto lets Baileys complete retries instead of hanging on "Aguardando mensagem"
        return { conversation: '' }
      }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update
      momai.log(`conn: qr=${!!qr} ${connection}`)

      if (qr) {
        momai.sendEvent('qr_code', { qr, expiresIn: 30 })
        momai.log('QR_CODE_EVENT_SENT')
      }

      if (connection === 'open') {
        connected = true
        groupMetaCache.clear()

        // Detect phone number and load per-phone whitelist
        try {
          const phone = (sock?.user?.id || sock?.authState?.creds?.me?.id || '')
            .split(':')[0]
            .replace(/\D/g, '')
          if (phone && phone !== _currentPhone) {
            _currentPhone = phone
            const dc = await momai.storage.get(_getDisabledContactsKey())
            if (dc) disabledContacts = dc
            else disabledContacts = []
            const pn = await momai.storage.get(_getContactNamesKey())
            if (pn) contactNames = pn
            else contactNames = {}
            const wc = await momai.storage.get(_getWaContactsKey())
            if (wc) waContacts = wc
            else waContacts = {}

            if (_cleanupStaleContacts()) {
              await momai.storage.set(_getWaContactsKey(), waContacts)
              await momai.storage.set(_getContactNamesKey(), contactNames)
              momai.log('Automatically cleaned up stale @lid contacts on active phone detection')
            }

          }
          if (phone && !chatHistory.length) {
            await loadChatHistory()
          }
        } catch {}
        momai.sendEvent('authenticated', { status: 'connected' })
        momai.sendEvent('history_loaded', { count: chatHistory.length })
        momai.log('WhatsApp connected')

        // Start pruning timer to remove deleted contacts from WhatsApp
        setTimeout(async () => {
          try {
            const existingWhatsAppKeys = Object.keys(waContacts).filter(
              (k) => !k.endsWith('@g.us')
            )
            const minRequired = Math.max(3, Math.floor(existingWhatsAppKeys.length * 0.3))

            if (receivedJids.size < minRequired) {
              momai.log(
                `Skipping pruning: only ${receivedJids.size} JIDs received vs ${existingWhatsAppKeys.length} stored (need ${minRequired})`
              )
              const total = Object.values(waContacts).filter(
                (c) => c.phone && !c.id.endsWith('@g.us')
              ).length
              momai.sendEvent('contacts_synced', { count: total })
              return
            }

            const before = Object.keys(waContacts).length
            let changed = false
            for (const key of existingWhatsAppKeys) {
              if (!receivedJids.has(key)) {
                delete waContacts[key]
                delete contactNames[key]
                const phone = key.split('@')[0]
                if (phone) {
                  delete contactNames[phone]
                }
                changed = true
              }
            }
            if (changed) {
              await momai.storage.set(_getWaContactsKey(), waContacts)
              await momai.storage.set(_getContactNamesKey(), contactNames)
              momai.log(
                `Sync session finished: pruned ${before - Object.keys(waContacts).length} deleted contacts`
              )
            }
            const total = Object.values(waContacts).filter(
              (c) => c.phone && !c.id.endsWith('@g.us')
            ).length
            momai.sendEvent('contacts_synced', { count: total })
          } catch (err) {
            momai.log(`Error finalizing contact sync: ${err.message}`)
          }
        }, 10000)
      } else if (connection === 'close') {
        connected = false
        if (preventAutoReconnect) {
          preventAutoReconnect = false
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          return
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) {
          momai.sendEvent('connection_status', { status: 'reconnecting' })
          setTimeout(connect, CHECK_INTERVAL)
        } else {
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
        }
      }
    })

    sock.ev.on('messaging-history.set', ({ contacts: syncedContacts }) => {
      const before = Object.keys(waContacts).length
      if (syncedContacts?.length) {
        momai.log(`History sync: received ${syncedContacts.length} contacts`)
        for (const c of syncedContacts) {
          if (c.id) receivedJids.add(c.id)
        }
        let added = 0
        let updated = 0
        for (const c of syncedContacts) {
          if (!c.id) continue

          // For @lid contacts, try to resolve to a standard JID or store with verifiedName (Business)
          if (c.id.endsWith('@lid')) {
            momai.log(
              `LID contact: id=${c.id} name=${c.name || '-'} notify=${c.notify || '-'} verifiedName=${c.verifiedName || '-'}`
            )
            // If this LID has a verifiedName, it's likely a Business account
            // Try to associate it with an existing standard JID
            const existingMatch = Object.values(waContacts).find(
              (existing) =>
                !existing.id.endsWith('@lid') &&
                existing.verifiedName &&
                existing.verifiedName === c.verifiedName
            )
            if (existingMatch) {
              existingMatch.lid = c.id
              if (c.verifiedName) existingMatch.verifiedName = c.verifiedName
              if (c.name) existingMatch.name = c.name
              continue // Link established, skip storing LID separately
            }
            
            // If we don't have a name/verifiedName/notify, it's anonymous, skip it
            if (!c.name && !c.verifiedName && !c.notify) {
              continue
            }
          }

          const phone = c.id.split('@')[0].replace(/\D/g, '')
          if (!phone) continue

          if (!waContacts[c.id]) {
            waContacts[c.id] = {
              id: c.id,
              name: c.name || null,
              notify: c.notify || null,
              verifiedName: c.verifiedName || null,
              phone,
              lid: c.lid || null
            }
            added++
          } else {
            // Update existing contact with fresh data
            if (c.name) waContacts[c.id].name = c.name
            if (c.notify) waContacts[c.id].notify = c.notify
            if (c.verifiedName) waContacts[c.id].verifiedName = c.verifiedName
            if (c.lid) waContacts[c.id].lid = c.lid
            updated++
          }
        }
        if (added > 0 || updated > 0) {
          momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
          momai.log(
            `Contacts stored: ${added} new, ${updated} updated, ${Object.keys(waContacts).length} total`
          )
        }
      }
      // Always emit contacts_synced so the UI knows the current count
      const total = Object.keys(waContacts).length
      if (total > 0) {
        momai.sendEvent('contacts_synced', { count: total })
      }
    })

    sock.ev.on('contacts.upsert', (contacts) => {
      let updated = 0
      for (const c of contacts) {
        if (c.id) receivedJids.add(c.id)
        if (!c.id) continue

        if (c.id.endsWith('@lid')) {
          // If this LID has a verifiedName, it's likely a Business account
          // Try to associate it with an existing standard JID
          const existingMatch = Object.values(waContacts).find(
            (existing) =>
              !existing.id.endsWith('@lid') &&
              existing.verifiedName &&
              existing.verifiedName === c.verifiedName
          )
          if (existingMatch) {
            existingMatch.lid = c.id
            if (c.verifiedName) existingMatch.verifiedName = c.verifiedName
            if (c.name) existingMatch.name = c.name
            continue
          }
          // If no name details, skip
          if (!c.name && !c.verifiedName && !c.notify) {
            continue
          }
        }

        const phone = c.id.split('@')[0].replace(/\D/g, '')
        if (!phone) continue
        waContacts[c.id] = {
          ...waContacts[c.id],
          id: c.id,
          name: c.name || waContacts[c.id]?.name || null,
          notify: c.notify || waContacts[c.id]?.notify || null,
          verifiedName: c.verifiedName || waContacts[c.id]?.verifiedName || null,
          phone,
          lid: c.lid || waContacts[c.id]?.lid || null
        }
        updated++
      }
      if (updated > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
      }
    })

    sock.ev.on('contacts.update', (updates) => {
      let changed = 0
      for (const u of updates) {
        if (u.id) receivedJids.add(u.id)
        if (!u.id) continue

        let target = waContacts[u.id]
        if (!target && u.id.endsWith('@lid')) {
          // Find standard contact linked to this LID
          target = Object.values(waContacts).find((c) => c.lid === u.id)
        }

        if (!target) continue

        if (u.notify) {
          target.notify = u.notify
          changed++
        }
        if (u.name) {
          target.name = u.name
          changed++
        }
        if (u.verifiedName) {
          target.verifiedName = u.verifiedName
          changed++
        }
      }
      if (changed > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
      }
    })

    sock.ev.on('messages.upsert', handleMessagesUpsert)
  } catch (err) {
    momai.log(`Connection error: ${err.message}`)
    setTimeout(connect, 5000)
  }
}

async function handleMessagesUpsert({ messages }) {
  for (const msg of messages) {
    if (msg.message && msg.key?.id) {
      cacheMessage(msg.key, msg.message)
    }
    if (!msg.message?.conversation && !msg.message?.extendedTextMessage) continue

    const isFromMe = msg.key.fromMe
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text) continue

    const senderJid = msg.key.participant || msg.key.remoteJid
    if (!senderJid) continue

    const isGroup = msg.key.remoteJid.endsWith('@g.us')

    // Self-healing LID association for incoming messages
    if (senderJid.endsWith('@lid')) {
      const hasLidMapping = Object.values(waContacts).some((c) => c.lid === senderJid)
      if (!hasLidMapping && msg.pushName) {
        const match = Object.values(waContacts).find(
          (c) => !c.id.endsWith('@lid') && (c.notify === msg.pushName || c.name === msg.pushName)
        )
        if (match) {
          waContacts[match.id].lid = senderJid
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
          momai.log(
            `Self-healed JID mapping: associated LID ${senderJid} with standard JID ${match.id} via pushName "${msg.pushName}"`
          )
        }
      }
    }

    // Now resolve standard JID for lookups
    const resolvedSenderJid = resolveStandardJid(senderJid) || senderJid

    // Ensure group/contact exists in waContacts
    if (isGroup) {
      if (!waContacts[msg.key.remoteJid]) {
        waContacts[msg.key.remoteJid] = {
          id: msg.key.remoteJid,
          name: 'Grupo',
          phone: msg.key.remoteJid.split('@')[0]
        }
        await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
      }
    } else {
      if (!resolvedSenderJid.endsWith('@lid') && !waContacts[resolvedSenderJid]) {
        const phone = resolvedSenderJid.split('@')[0].replace(/\D/g, '')
        if (phone) {
          waContacts[resolvedSenderJid] = {
            id: resolvedSenderJid,
            name: null,
            notify: msg.pushName || null,
            verifiedName: null,
            phone
          }
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        }
      }
    }

    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const RETRY_DELAY = 10 * 60 * 1000 // 10 minutes on failure

    // Fetch group metadata (subject) dynamically if needed
    if (
      sock &&
      connected &&
      isGroup &&
      (!waContacts[msg.key.remoteJid]?.name || waContacts[msg.key.remoteJid]?.name === 'Grupo')
    ) {
      try {
        const meta = await Promise.race([
          sock.groupMetadata(msg.key.remoteJid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ])
        if (meta?.subject) {
          waContacts[msg.key.remoteJid].name = meta.subject
          await momai.storage.set(_getWaContactsKey(), waContacts)
        }
        groupMetaCache.set(msg.key.remoteJid, { data: meta, fetchedAt: Date.now() })
      } catch (err) {
        momai.log(`Failed to fetch group metadata: ${err.message}`)
      }
    }

    // Fetch avatar picture (group avatar if group, sender avatar if private)
    const avatarTarget = isGroup ? msg.key.remoteJid : resolvedSenderJid
    if (sock && connected && waContacts[avatarTarget]) {
      const lastChecked = waContacts[avatarTarget].profilePicCheckedAt || 0
      const isFailedRecently =
        !waContacts[avatarTarget].profilePicUrl && now - lastChecked < RETRY_DELAY
      const isSuccessRecently =
        waContacts[avatarTarget].profilePicUrl && now - lastChecked < ONE_DAY

      if (!isFailedRecently && !isSuccessRecently) {
        try {
          const url = await Promise.race([
            sock.profilePictureUrl(avatarTarget, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ])
          if (waContacts[avatarTarget]) {
            waContacts[avatarTarget].profilePicUrl = url
            waContacts[avatarTarget].profilePicCheckedAt = now
            await momai.storage.set(_getWaContactsKey(), waContacts)
          }
        } catch {
          if (waContacts[avatarTarget]) {
            waContacts[avatarTarget].profilePicCheckedAt = now - ONE_DAY + RETRY_DELAY
            await momai.storage.set(_getWaContactsKey(), waContacts)
          }
        }
      }
    }

    const groupName = isGroup ? waContacts[msg.key.remoteJid]?.name || 'Grupo' : null
    const displayName = isFromMe
      ? resolvedSenderJid.split('@')[0] || resolvedSenderJid
      : resolveContactName(resolvedSenderJid)

    chatHistory.unshift({
      from: displayName,
      jid: msg.key.remoteJid, // Target JID for replies
      senderJid: resolvedSenderJid,
      text,
      timestamp: msg.messageTimestamp,
      direction: isFromMe ? 'outgoing' : 'incoming',
      isGroup,
      groupName
    })
    if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
    totalMessages++
    schedulePersistChatHistory()
    momai.log(
      `Message tracked: from=${displayName} text="${text.substring(0, 50)}" total=${totalMessages}`
    )

    const shouldNotify = isFromMe || !_isContactDisabled(resolvedSenderJid)
    if (shouldNotify) {
      momai.sendEvent('whatsapp_notification', {
        contact: displayName,
        contactJid: msg.key.remoteJid, // Send to group JID if group, sender JID if private
        senderJid: resolvedSenderJid,
        message: text,
        timestamp: msg.messageTimestamp,
        contactAvatar: isGroup
          ? waContacts[msg.key.remoteJid]?.profilePicUrl || null
          : waContacts[resolvedSenderJid]?.profilePicUrl || null,
        isGroup: !!isGroup,
        groupName: isGroup ? groupName : undefined
      })
    }
  }
}

function resolveJidForSending(contact) {
  momai.log(`[resolveJidForSending] Input contact="${contact}"`)
  if (!contact || typeof contact !== 'string' || contact.trim() === '') {
    return null
  }

  let jid = contact.trim()

  // 1. If it's already a valid group JID, return it directly
  if (jid.endsWith('@g.us')) {
    return jid
  }

  // 2. If it ends with @lid, resolve to s.whatsapp.net JID from waContacts
  if (jid.endsWith('@lid')) {
    const matched = Object.values(waContacts).find((c) => c.lid === jid || c.id === jid)
    if (matched && matched.id && !matched.id.endsWith('@lid')) {
      return matched.id
    }
    return jid // fallback
  }

  // 3. If it contains letters (i.e. it is a display name like "Pai Tenebroso")
  const isJid = jid.includes('@')
  const hasLetters = /[a-zA-Z\s]/.test(jid.split('@')[0])

  if (!isJid || hasLetters) {
    const cleanContact = jid.split('@')[0].trim().toLowerCase()

    // First try: Find match in contactNames
    for (const [key, name] of Object.entries(contactNames)) {
      if (name && name.toLowerCase() === cleanContact) {
        let resolved = key
        if (!resolved.includes('@')) {
          resolved = `${resolved}@s.whatsapp.net`
        }
        if (resolved.endsWith('@s.whatsapp.net')) {
          return resolved
        }
      }
    }

    // Second try: Find in waContacts displayName / name / notify / phone
    for (const [cId, c] of Object.entries(waContacts)) {
      if (cId.endsWith('@lid')) continue

      const displayName = (
        contactNames[c.phone] ||
        c.name ||
        c.notify ||
        c.verifiedName ||
        ''
      ).toLowerCase()
      if (
        displayName === cleanContact ||
        (c.name && c.name.toLowerCase() === cleanContact) ||
        (c.notify && c.notify.toLowerCase() === cleanContact) ||
        (c.phone && c.phone === cleanContact)
      ) {
        return cId
      }
    }
  }

  // 4. If it's just a raw number (digits only), format as @s.whatsapp.net
  if (!jid.includes('@')) {
    const digitsOnly = jid.replace(/\D/g, '')
    if (digitsOnly) {
      return `${digitsOnly}@s.whatsapp.net`
    }
  }

  return jid
}

async function sendMessage(contact, message) {
  if (!sock || !connected) throw new Error('WhatsApp not connected')

  const jid = resolveJidForSending(contact)
  if (!jid) {
    throw new Error(`Invalid contact: "${contact}"`)
  }

  const isGroup = jid.endsWith('@g.us')
  momai.log(
    `sendMessage: contact="${contact}" resolved_jid="${jid}" group=${isGroup} msg="${(message || '').substring(0, 40)}"`
  )

  if (isGroup) {
    await prepareGroupForSend(jid)
  }

  const MAX_RETRIES = isGroup ? 4 : 3
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const sent = await sock.sendMessage(jid, { text: message })
      if (sent?.key?.id && sent?.message) {
        cacheMessage(sent.key, sent.message)
      }
      lastError = null
      break
    } catch (err) {
      lastError = err
      momai.log(`sendMessage attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`)

      if (attempt < MAX_RETRIES) {
        const delayMs = (isGroup ? 2500 : 1500) * attempt
        if (isGroup) {
          await resetGroupSenderKeyMemory(jid)
        }
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  if (lastError) throw lastError

  const displayName = resolveContactName(jid)
  chatHistory.unshift({
    from: displayName,
    jid: jid,
    text: message,
    timestamp: Math.floor(Date.now() / 1000),
    direction: 'outgoing'
  })
  if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
  totalMessages++
  schedulePersistChatHistory()

  momai.sendEvent('message_sent', { contact: displayName, jid })

  return { ok: true }
}

async function getPanelData() {
  const validContacts = Object.values(waContacts).filter(
    (c) => c.phone && !c.id.endsWith('@g.us')
  )
  return {
    connected,
    syncedContacts: validContacts.length,
    disabledCount: disabledContacts.length
  }
}

process.on('SIGINT', () => {
  flushPersistedChatHistory()
    .catch(() => {})
    .finally(() => process.exit(0))
})
process.on('SIGTERM', () => {
  flushPersistedChatHistory()
    .catch(() => {})
    .finally(() => process.exit(0))
})

// IPC listener for tool execution from LLM
process.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    await flushPersistedChatHistory()
    process.exit(0)
    return
  }
  if (msg.type === 'execute') {
    try {
      let result
      switch (msg.payload?.toolName) {
        case 'send_message':
          try {
            result = await sendMessage(msg.payload.args?.contact, msg.payload.args?.message)
            momai.log(
              `send_message OK: to=${msg.payload.args?.contact} msg="${(msg.payload.args?.message || '').substring(0, 50)}"`
            )
            result.directResponse = `Mensagem enviada`
          } catch (err) {
            momai.log(`send_message FAILED: ${err.message}`)
            result = {
              ok: false,
              error: err.message,
              directResponse: `Erro ao enviar: ${err.message}`
            }
          }
          break
        case 'list_contacts': {
          const allContacts = Object.values(waContacts)
            .filter((c) => c.phone && !c.id.endsWith('@g.us'))
            .map((c) => ({
              id: c.id,
              name: contactNames[c.phone] || c.name || c.notify || c.verifiedName || c.phone,
              phone: c.phone,
              monitoring: !_isContactDisabled(c.id),
              profilePicUrl: c.profilePicUrl || null
            }))
          result = { contacts: allContacts }
          break
        }
        case 'toggle_monitoring': {
          const contactId = msg.payload.args?.contact
          if (!contactId) break
          const isDisabled = _isContactDisabled(contactId)
          if (isDisabled) {
            disabledContacts = disabledContacts.filter((d) => {
              const dDigits = String(d).replace(/\D/g, '')
              const cDigits = String(contactId).replace(/\D/g, '')
              return !(
                d === contactId ||
                (dDigits && cDigits && (dDigits.endsWith(cDigits) || cDigits.endsWith(dDigits)))
              )
            })
          } else {
            disabledContacts.push(contactId)
          }
          await momai.storage.set(_getDisabledContactsKey(), disabledContacts)
          result = { ok: true, contact: contactId, monitoring: isDisabled }
          break
        }
        case 'set_contact_name':
          if (msg.payload.args?.contact && msg.payload.args?.name) {
            contactNames[msg.payload.args.contact] = msg.payload.args.name
            await momai.storage.set(_getContactNamesKey(), contactNames)
            result = { ok: true }
          }
          break
        case 'get_stats': {
          const validContacts = Object.values(waContacts).filter(
            (c) => c.phone && !c.id.endsWith('@g.us')
          )
          const syncedContactsCount = validContacts.length
          const monitoredContactsCount = validContacts.filter(
            (c) => !_isContactDisabled(c.id)
          ).length

          result = {
            connected,
            totalMessages,
            syncedContacts: syncedContactsCount,
            disabledCount: disabledContacts.length,
            monitoredCount: monitoredContactsCount
          }
          break
        }
        case 'sync_contacts': {
          momai.log('Manual contacts sync requested')
          const cleaned = _cleanupStaleContacts()
          if (cleaned) {
            await momai.storage.set(_getWaContactsKey(), waContacts)
            await momai.storage.set(_getContactNamesKey(), contactNames)
          }

          if (sock && connected) {
            const now = Date.now()
            const validContacts = Object.values(waContacts).filter(
              (c) => c.phone && !c.id.endsWith('@g.us')
            )

            const promises = validContacts.slice(0, 15).map(async (c) => {
              try {
                const url = await Promise.race([
                  sock.profilePictureUrl(c.id, 'image'),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                ])
                if (url && waContacts[c.id]) {
                  waContacts[c.id].profilePicUrl = url
                  waContacts[c.id].profilePicCheckedAt = now
                }
              } catch (err) {
                // Ignore profile picture fetch errors
              }
            })
            await Promise.all(promises)
            await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
          }

          const total = Object.values(waContacts).filter(
            (c) => c.phone && !c.id.endsWith('@g.us')
          ).length
          momai.sendEvent('contacts_synced', { count: total })

          result = { ok: true, syncedContacts: total }
          break
        }
        case 'get_wa_contacts': {
          const search = (msg.payload.args?.search || '').toLowerCase()
          const page = parseInt(msg.payload.args?.page) || 1
          const perPage = parseInt(msg.payload.args?.perPage) || 20
          let entries = Object.values(waContacts).filter((c) => c.phone && !c.id.endsWith('@g.us'))
          if (search) {
            entries = entries.filter(
              (c) =>
                (c.name || '').toLowerCase().includes(search) ||
                (c.notify || '').toLowerCase().includes(search) ||
                (c.verifiedName || '').toLowerCase().includes(search) ||
                c.phone.includes(search)
            )
          }
          const sorted = entries
            .map((c) => {
              const hasName = !!(contactNames[c.phone] || c.name || c.notify || c.verifiedName)
              return {
                id: c.id,
                displayName:
                  contactNames[c.phone] || c.name || c.notify || c.verifiedName || c.phone,
                hasName,
                name: c.name || null,
                notify: c.notify || null,
                phone: c.phone,
                monitoring: !_isContactDisabled(c.id),
                profilePicUrl: c.profilePicUrl || null
              }
            })
            .sort((a, b) => {
              if (a.hasName && !b.hasName) return -1
              if (!a.hasName && b.hasName) return 1
              return (a.displayName || '').localeCompare(b.displayName || '')
            })
          const totalFiltered = sorted.length
          const totalPages = Math.ceil(totalFiltered / perPage)
          const start = (page - 1) * perPage
          const paginated = sorted.slice(start, start + perPage)

          // Fetch profile pictures in background for this page if missing or checked > 1 day ago
          if (sock && connected) {
            const now = Date.now()
            const ONE_DAY = 24 * 60 * 60 * 1000
            const RETRY_DELAY = 10 * 60 * 1000 // 10 minutes on failure

            // Fetch sequentially with 300ms delay to avoid rate limiting
            ;(async () => {
              for (const c of paginated) {
                const lastChecked = waContacts[c.id]?.profilePicCheckedAt || 0
                const isFailedRecently =
                  !waContacts[c.id]?.profilePicUrl && now - lastChecked < RETRY_DELAY
                const isSuccessRecently =
                  waContacts[c.id]?.profilePicUrl && now - lastChecked < ONE_DAY

                if (!isFailedRecently && !isSuccessRecently) {
                  // Wait 300ms between requests to avoid rate limit
                  await new Promise((resolve) => setTimeout(resolve, 300))

                  try {
                    const url = await Promise.race([
                      sock.profilePictureUrl(c.id, 'image'),
                      new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 5000)
                      )
                    ])
                    if (waContacts[c.id]) {
                      waContacts[c.id].profilePicUrl = url
                      waContacts[c.id].profilePicCheckedAt = now
                      await momai.storage.set(_getWaContactsKey(), waContacts)
                      momai.sendEvent('contacts_updated', {})
                    }
                  } catch {
                    if (waContacts[c.id]) {
                      // On failure, allow retry after RETRY_DELAY
                      waContacts[c.id].profilePicCheckedAt = now - ONE_DAY + RETRY_DELAY
                      await momai.storage.set(_getWaContactsKey(), waContacts)
                    }
                  }
                }
              }
            })().catch(() => {})
          }

          result = {
            contacts: paginated,
            total: Object.keys(waContacts).length,
            totalFiltered,
            page,
            totalPages,
            perPage
          }
          break
        }
        case 'get_history':
          if (chatHistory.length === 0) {
            await loadChatHistory()
          }
          result = {
            history: chatHistory.slice(0, 50).map((h) => {
              const isGroupMsg = h.isGroup || (h.jid && h.jid.endsWith('@g.us'))
              return {
                ...h,
                profilePicUrl: resolveChatAvatarUrl(h.jid, isGroupMsg, h.senderJid)
              }
            })
          }
          break
        case 'flush_history':
          await flushPersistedChatHistory()
          result = { ok: true, count: chatHistory.length }
          break
        case 'get_avatars': {
          const jids = Array.isArray(msg.payload.args?.jids) ? msg.payload.args.jids : []
          const unique = [...new Set(jids.filter((j) => typeof j === 'string' && j.includes('@')))]
          const avatars = {}
          for (let i = 0; i < unique.length; i++) {
            if (i > 0) await new Promise((r) => setTimeout(r, 300))
            avatars[unique[i]] = await ensureAvatarForJid(unique[i])
          }
          result = { avatars }
          momai.sendEvent('contacts_updated', {})
          break
        }
        case 'disconnect':
        case 'logout': {
          preventAutoReconnect = true
          connected = false
          momai.log('WhatsApp disconnect requested')
          if (sock) {
            try {
              await sock.logout()
            } catch (e) {
              momai.log(`disconnect logout: ${e.message}`)
            }
            try {
              sock.end(undefined)
            } catch (e) {
              momai.log(`disconnect end: ${e.message}`)
            }
            sock = null
          }
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          result = { ok: true }
          break
        }
        case 'panel':
          result = await getPanelData()
          break
        default: {
          // Voice command via "responda": reply to last contact
          const lastIncoming = chatHistory.find((m) => m.direction === 'incoming')
          if (
            lastIncoming &&
            msg.payload?.content &&
            msg.payload.content.toLowerCase().includes('responda')
          ) {
            const replyMsg = msg.payload.content.replace(/responda\s+/i, '').trim()
            if (replyMsg) {
              await sendMessage(lastIncoming.jid, replyMsg)
              result = {
                ok: true,
                to: lastIncoming.from,
                message: replyMsg,
                directResponse: `Mensagem enviada para ${lastIncoming.from}`
              }
            } else {
              result = {
                ok: false,
                error: 'mensagem vazia',
                directResponse: 'Fale a mensagem depois de responda'
              }
            }
          } else if (
            lastIncoming &&
            msg.payload?.content &&
            msg.payload.content.toLowerCase().startsWith('responda')
          ) {
            const replyMsg = msg.payload.content.replace(/^responda\s+/i, '').trim()
            if (replyMsg) {
              await sendMessage(lastIncoming.jid, replyMsg)
              result = {
                ok: true,
                to: lastIncoming.from,
                message: replyMsg,
                directResponse: `Mensagem enviada para ${lastIncoming.from}`
              }
            } else {
              result = { ok: false, error: 'mensagem vazia' }
            }
          } else {
            result = await getPanelData()
          }
          break
        }
      }
      process.send({ type: 'response', requestId: msg.requestId, result })
    } catch (err) {
      process.send({
        type: 'response',
        requestId: msg.requestId,
        result: { ok: false, error: err.message }
      })
    }
  }
})

main().catch((err) => {
  momai.log(`Fatal error: ${err.message}`)
  process.exit(1)
})
