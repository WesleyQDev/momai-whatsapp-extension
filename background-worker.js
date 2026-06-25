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
const {
  migratePlainCredsToEncrypted,
  decryptCredsForBaileys,
  reEncryptCredsAfterBaileys
} = require('./baileys-cred-migration')
const { secureWriteFile } = require('./fs-permissions')

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
const workerStartTime = Math.floor(Date.now() / 1000)
const CONTACT_NAMES_KEY = 'contact_names'
const WA_CONTACTS_KEY = 'wa_contacts'
const SETTINGS_KEY = 'settings'
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
      await secureWriteFile(path.join(_storageBase, `${key}.json`), serialized)
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
let reconnectTimer = null
let isConnecting = false

function _clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

let disabledContacts = []
let contactNames = {}
let waContacts = {}
let notificationsDisabled = false
let connected = false
let lastQr = null
let lastQrAt = 0
const QR_TTL_MS = 65000

let cachedBaileysVersion = null
let cachedBaileysVersionAt = 0

async function getBaileysVersion() {
  if (cachedBaileysVersion && Date.now() - cachedBaileysVersionAt < 86400000) {
    return cachedBaileysVersion
  }
  const { version } = await fetchLatestBaileysVersion()
  cachedBaileysVersion = version
  cachedBaileysVersionAt = Date.now()
  return version
}

function _qrStillValid() {
  return Boolean(lastQr && Date.now() - lastQrAt < QR_TTL_MS)
}

// Baileys fires `creds.update` very frequently (every few hundred ms while
// connected). Re-encrypting on every event would thrash safeStorage. Debounce
// so the .enc is at most RE_ENCRYPT_DEBOUNCE_MS behind the plain file. The
// migration in baileys-cred-migration.js picks up any remaining drift on the
// next worker restart as a safety net.
const RE_ENCRYPT_DEBOUNCE_MS = 1000
let reEncryptDebounceTimer = null
function _scheduleReEncrypt() {
  if (reEncryptDebounceTimer) return
  reEncryptDebounceTimer = setTimeout(() => {
    reEncryptDebounceTimer = null
    reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth')).catch(
      (err) => momai.log(`debounced re-encrypt failed: ${err.message}`)
    )
  }, RE_ENCRYPT_DEBOUNCE_MS)
}

/* creds.json exists after useMultiFileAuthState even without a real session.
   Only treat it as "valid" if Baileys saved a real registrationId. */
function _hasSavedSession() {
  try {
    const cp = path.join(momai.storage.storageDir, 'baileys-auth', 'creds.json')
    if (!require('fs').existsSync(cp)) return false
    const raw = require('fs').readFileSync(cp, 'utf8')
    const creds = JSON.parse(raw)
    return Number.isFinite(creds.registrationId) && creds.registrationId > 0
  } catch {
    return false
  }
}

function _emitQrCode(qr) {
  lastQr = qr
  lastQrAt = Date.now()
  const expiresIn = Math.max(1, Math.ceil((QR_TTL_MS - (Date.now() - lastQrAt)) / 1000))
  momai.sendEvent('qr_code', { qr, expiresIn })
}

/** 0 = name starts with a letter (A–Z, including accented); 1 = digits, symbols, emoji, etc. */
function _contactDisplayNameSortTier(displayName) {
  const trimmed = String(displayName || '').trim()
  if (!trimmed) return 1
  return /^\p{L}/u.test(trimmed) ? 0 : 1
}

function _compareContactsForList(a, b) {
  if (a.hasName !== b.hasName) {
    return a.hasName ? -1 : 1
  }
  const tierA = _contactDisplayNameSortTier(a.displayName)
  const tierB = _contactDisplayNameSortTier(b.displayName)
  if (tierA !== tierB) return tierA - tierB
  return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'pt-BR', {
    sensitivity: 'base',
    numeric: true
  })
}

async function _fetchPaginatedWaEntries({ groupsOnly, search, page, perPage }) {
  const q = String(search || '').toLowerCase()
  const pageNum = parseInt(page) || 1
  const perPageNum = parseInt(perPage) || 20

  let entries = Object.values(waContacts).filter((c) =>
    groupsOnly ? c.id.endsWith('@g.us') : c.phone && !c.id.endsWith('@g.us')
  )

  if (q) {
    entries = entries.filter((c) => {
      const label = _resolveWaContactDisplayName(c, c.id).toLowerCase()
      return (
        label.includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.notify || '').toLowerCase().includes(q) ||
        (c.verifiedName || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      )
    })
  }

  const sorted = entries
    .map((c) => {
      const resolvedLabel = _resolveWaContactDisplayName(c, c.id)
      const hasName = Boolean(
        _pickContactLabel(
          contactNames[c.id],
          contactNames[c.phone],
          c.name,
          c.notify,
          c.verifiedName
        )
      )
      return {
        id: c.id,
        displayName: resolvedLabel,
        hasName,
        name: _isUsableDisplayName(c.name) ? c.name : null,
        notify: _isUsableDisplayName(c.notify) ? c.notify : null,
        phone: c.phone || c.id.split('@')[0],
        monitoring: !_isContactDisabled(c.id),
        profilePicUrl: c.profilePicUrl || null,
        isGroup: groupsOnly
      }
    })
    .sort(_compareContactsForList)

  const totalFiltered = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPageNum))
  const start = (pageNum - 1) * perPageNum
  const paginated = sorted.slice(start, start + perPageNum)

  if (sock && connected) {
    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const RETRY_DELAY = 10 * 60 * 1000

    ;(async () => {
      for (const c of paginated) {
        const lastChecked = waContacts[c.id]?.profilePicCheckedAt || 0
        const isFailedRecently = !waContacts[c.id]?.profilePicUrl && now - lastChecked < RETRY_DELAY
        const isSuccessRecently = waContacts[c.id]?.profilePicUrl && now - lastChecked < ONE_DAY

        if (!isFailedRecently && !isSuccessRecently) {
          await new Promise((resolve) => setTimeout(resolve, 300))
          try {
            const url = await Promise.race([
              sock.profilePictureUrl(c.id, 'image'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ])
            if (waContacts[c.id]) {
              waContacts[c.id].profilePicUrl = url
              waContacts[c.id].profilePicCheckedAt = now
              await momai.storage.set(_getWaContactsKey(), waContacts)
              momai.sendEvent('contacts_updated', {})
            }
          } catch {
            if (waContacts[c.id]) {
              waContacts[c.id].profilePicCheckedAt = now - ONE_DAY + RETRY_DELAY
              await momai.storage.set(_getWaContactsKey(), waContacts)
            }
          }
        }
      }
    })().catch(() => {})
  }

  return {
    contacts: paginated,
    total: entries.length,
    totalFiltered,
    page: pageNum,
    totalPages,
    perPage: perPageNum
  }
}

/** WhatsApp often syncs "." or ".." when the user hides their display name. */
function _isUsableDisplayName(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return false
  if (/^[\p{P}\p{S}]+$/u.test(trimmed)) return false
  return true
}

function _pickContactLabel(...candidates) {
  for (const candidate of candidates) {
    if (_isUsableDisplayName(candidate)) return String(candidate).trim()
  }
  return null
}

function _formatPhoneLabel(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return 'Contato'
  return `+${digits}`
}

function _resolveWaContactDisplayName(contact, jid) {
  const phone = contact?.phone || (jid || '').split('@')[0]
  const custom = _pickContactLabel(contactNames[jid], contactNames[phone])
  const fromWa = _pickContactLabel(contact?.name, contact?.notify, contact?.verifiedName)
  if (custom) return custom
  if (fromWa) return fromWa
  if (jid?.endsWith('@g.us')) return 'Grupo'
  return _formatPhoneLabel(phone)
}

function _sanitizeStoredContactNames() {
  let changed = false
  for (const contact of Object.values(waContacts)) {
    if (contact.name && !_isUsableDisplayName(contact.name)) {
      contact.name = null
      changed = true
    }
    if (contact.notify && !_isUsableDisplayName(contact.notify)) {
      contact.notify = null
      changed = true
    }
    if (contact.verifiedName && !_isUsableDisplayName(contact.verifiedName)) {
      contact.verifiedName = null
      changed = true
    }
  }
  return changed
}
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

function _getSettingsKey() {
  return _currentPhone ? `settings-${_currentPhone}` : SETTINGS_KEY
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
    const keys = [
      ...new Set([_currentPhone ? _getChatHistoryKey() : null, CHAT_HISTORY_KEY].filter(Boolean))
    ]
    for (const key of keys) {
      const saved = await momai.storage.get(key)
      if (!Array.isArray(saved) || saved.length === 0) continue
      chatHistory = saved.map(enrichHistoryEntry)
      totalMessages = Math.max(totalMessages, chatHistory.length)
      momai.log(`loadChatHistory: ${saved.length} msgs from ${key}`)
      schedulePersistChatHistory()
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

  // Strip Baileys device suffix (e.g. 55...:1@s.whatsapp.net -> 55...@s.whatsapp.net)
  let standard = jid
  if (jid.includes(':') && jid.includes('@')) {
    const [user, domain] = jid.split('@')
    standard = user.split(':')[0] + '@' + domain
  }

  const rawNumber = standard.split('@')[0]

  // Try to find by LID mapping
  const matchByLid = Object.values(waContacts).find(
    (c) => c.lid === standard || c.lid === rawNumber
  )
  if (matchByLid) return matchByLid.id

  // Try to find by phone (for LID-like JIDs that are actually mapped)
  const matchByPhone = Object.values(waContacts).find((c) => c.phone === rawNumber)
  if (matchByPhone) return matchByPhone.id

  return standard
}

/** DM via @lid: Baileys may put a @g.us JID in participant — ignore for 1:1 chats. */
function resolveMessageSenderJid(remoteJid, participant) {
  const isGroup = remoteJid?.endsWith('@g.us')
  if (isGroup) {
    const sender = participant || remoteJid
    return resolveStandardJid(sender) || sender
  }
  if (participant && !participant.endsWith('@g.us')) {
    return resolveStandardJid(participant) || participant
  }
  return resolveStandardJid(remoteJid) || remoteJid
}

function enrichHistoryEntry(h) {
  if (!h) return h
  const remoteJid = h.jid || ''
  const isGroupChat = remoteJid.endsWith('@g.us')

  let senderJid = h.senderJid || remoteJid
  if (!isGroupChat && senderJid.endsWith('@g.us')) {
    senderJid = resolveStandardJid(remoteJid) || remoteJid
  } else {
    senderJid = resolveMessageSenderJid(remoteJid, isGroupChat ? h.senderJid : senderJid)
  }

  const replyJid = isGroupChat ? remoteJid : resolveStandardJid(remoteJid) || remoteJid

  const timestamp = h.timestamp ? Number(h.timestamp) : Math.floor(Date.now() / 1000)

  const groupLabel = _pickContactLabel(
    contactNames[remoteJid],
    waContacts[remoteJid]?.name,
    waContacts[remoteJid]?.verifiedName,
    h.groupName
  )

  let from = h.from
  const fromInvalid =
    h.forceUpdateNames || !from || !_isUsableDisplayName(from) || (!isGroupChat && from === 'Grupo')
  if (fromInvalid) {
    from = isGroupChat
      ? groupLabel || resolveContactName(remoteJid) || 'Grupo'
      : resolveContactName(senderJid) || resolveContactName(remoteJid)
  }

  return {
    ...h,
    jid: remoteJid,
    senderJid,
    replyJid,
    timestamp,
    from,
    isGroup: isGroupChat,
    groupName: isGroupChat ? groupLabel || resolveContactName(remoteJid) || from : null,
    profilePicUrl: resolveChatAvatarUrl(remoteJid, isGroupChat, senderJid)
  }
}

function resolveContactName(jid) {
  if (!jid) return ''

  jid = resolveStandardJid(jid)

  if (jid.endsWith('@lid')) {
    if (waContacts[jid]) {
      return _resolveWaContactDisplayName(waContacts[jid], jid)
    }
    const matched = Object.values(waContacts).find((c) => c.lid === jid)
    if (matched) {
      return resolveContactName(matched.id)
    }
  }

  const rawNumber = jid.split('@')[0]
  const digitsOnly = rawNumber.replace(/\D/g, '')

  // Try exact match in contactNames
  const customByJid = _pickContactLabel(contactNames[jid])
  if (customByJid) return customByJid
  const customByNumber = _pickContactLabel(contactNames[rawNumber])
  if (customByNumber) return customByNumber
  const customByDigits = _pickContactLabel(contactNames[digitsOnly])
  if (customByDigits) return customByDigits

  // Try partial digit match in contactNames
  for (const key of Object.keys(contactNames)) {
    const keyDigits = String(key).replace(/\D/g, '')
    if (
      keyDigits &&
      keyDigits.length >= 8 &&
      (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))
    ) {
      const matched = _pickContactLabel(contactNames[key])
      if (matched) return matched
    }
  }

  const wc =
    waContacts[jid] || Object.values(waContacts).find((c) => c.id.split('@')[0] === rawNumber)
  if (wc) return _resolveWaContactDisplayName(wc, jid)
  if (wc) return _resolveWaContactDisplayName(wc, jid)

  for (const [key, contact] of Object.entries(waContacts)) {
    const keyDigits = key.split('@')[0].replace(/\D/g, '')
    if (keyDigits && (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))) {
      return _resolveWaContactDisplayName(contact, key)
    }
  }

  if (jid.endsWith('@g.us')) return 'Grupo'
  return _formatPhoneLabel(rawNumber)
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
  const direct = getStoredAvatarUrl(jid)
  if (direct) return direct
  const standard = resolveStandardJid(jid)
  if (standard && standard !== jid) {
    const fromStandard = getStoredAvatarUrl(standard)
    if (fromStandard) return fromStandard
  }
  if (senderJid && !senderJid.endsWith('@g.us')) {
    return getStoredAvatarUrl(senderJid)
  }
  return null
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
      const st = await momai.storage.get(_getSettingsKey())
      if (st) {
        if (st.notificationsDisabled !== undefined) notificationsDisabled = st.notificationsDisabled
      }

      let storageDirty = false
      if (_cleanupStaleContacts()) storageDirty = true
      if (_sanitizeStoredContactNames()) storageDirty = true
      if (storageDirty) {
        await momai.storage.set(_getWaContactsKey(), waContacts)
        await momai.storage.set(_getContactNamesKey(), contactNames)
        momai.log('Cleaned up stale or placeholder WhatsApp contacts from phone storage')
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

  if (_cleanupStaleContacts() || _sanitizeStoredContactNames()) {
    await momai.storage.set(WA_CONTACTS_KEY, waContacts)
    await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
    momai.log('Cleaned up stale or placeholder WhatsApp contacts from fallback storage')
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
  if (isConnecting) return
  isConnecting = true
  _clearReconnectTimer()

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update')
        sock.ev.removeAllListeners('creds.update')
        sock.ev.removeAllListeners('messages.upsert')
        sock.end(undefined)
      } catch (e) {
        momai.log(`Error closing old socket: ${e.message}`)
      }
      sock = null
    }

    receivedJids.clear()
    const version = await getBaileysVersion()
    const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
    const hasCreds = _hasSavedSession()
    momai.log(`connect: savedSession=${hasCreds}`)
    // Decrypt creds.json.enc → creds.json before Baileys reads it, and
    // migrate any legacy plain creds.json to creds.json.enc on first run.
    // Trade-off: plain creds.json lives on disk while Baileys is running.
    await migratePlainCredsToEncrypted(authDir)
    const decrypted = await decryptCredsForBaileys(authDir)
    // Guard against silent auth loss: if creds.json.enc exists but the
    // decrypt call failed (e.g. OS keychain locked, safeStorage flipped
    // unavailable), do NOT let useMultiFileAuthState create a fresh
    // creds.json — that would overwrite the encrypted session on the
    // next re-encrypt and silently log the user out. Surface the error
    // and exit so the host can prompt the user to re-pair.
    const encCredsPath = path.join(authDir, 'creds.json.enc')
    const encCredsExists = await fs.access(encCredsPath).then(
      () => true,
      () => false
    )
    if (encCredsExists && !decrypted) {
      // creds.json.enc exists but cannot be decrypted (e.g. OS keychain
      // locked, safeStorage unavailable in dev mode). The encrypted session
      // is already lost — there is nothing to preserve. Delete the stale
      // encrypted file and continue with a fresh start so the user can
      // scan a new QR code. Exiting (process.exit(1)) would trap the app
      // in an infinite restart loop with no way to re-pair.
      momai.log(
        '[whatsapp] WARN: creds.json.enc could not be decrypted ' +
          '(safeStorage unavailable?). Clearing stale credentials for fresh re-pair.'
      )
      try {
        await fs.unlink(encCredsPath)
      } catch {}
      try {
        const plainCreds = path.join(authDir, 'creds.json')
        await fs.unlink(plainCreds).catch(() => {})
      } catch {}
      momai.sendEvent('authenticated', {
        status: 'logged_out',
        reason: 'keychain_unavailable',
        message:
          'Credenciais anteriores não puderam ser descriptografadas. Por favor, reconecte com um novo QR code.'
      })
    }
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    // Setup logger with pino or fallback, redirecting warning/error events to momai.log
    let logger
    if (pino) {
      logger = pino(
        { level: 'warn' },
        {
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
        }
      )
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

    sock.ev.on('creds.update', () => {
      saveCreds()
      _scheduleReEncrypt()
    })

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update
      momai.log(`conn: qr=${!!qr} ${connection}`)

      if (qr) {
        _emitQrCode(qr)
        momai.log('QR_CODE_EVENT_SENT')
      }

      if (connection === 'open') {
        _clearReconnectTimer()
        isConnecting = false
        lastQr = null
        lastQrAt = 0
        connected = true
        groupMetaCache.clear()

        // Baileys has loaded creds.json and is now running. Move the Signal
        // protocol keys back to encrypted-at-rest storage. While Baileys is
        // connected, creds.json stays plain on disk (Baileys needs it there).
        // On the next worker restart (or on close/disconnect) we'll re-encrypt.
        reEncryptCredsAfterBaileys(authDir).catch((err) =>
          momai.log(`post-connect re-encrypt failed: ${err.message}`)
        )

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
            const existingWhatsAppKeys = Object.keys(waContacts).filter((k) => !k.endsWith('@g.us'))
            const minRequired = Math.max(3, Math.floor(existingWhatsAppKeys.length * 0.3))

            if (receivedJids.size < minRequired) {
              momai.log(
                `Skipping pruning: only ${receivedJids.size} JIDs received vs ${existingWhatsAppKeys.length} stored (need ${minRequired})`
              )
              const total = Object.values(waContacts).filter(
                (c) => c.phone && !c.id.endsWith('@g.us')
              ).length
              momai.sendEvent('contacts_synced', { count: total, isFinal: true })
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
            momai.sendEvent('contacts_synced', { count: total, isFinal: true })
          } catch (err) {
            momai.log(`Error finalizing contact sync: ${err.message}`)
          }
        }, 10000)
      } else if (connection === 'close') {
        connected = false
        isConnecting = false
        // Move creds back to encrypted-at-rest before the next reconnect.
        reEncryptCredsAfterBaileys(authDir).catch((err) =>
          momai.log(`post-close re-encrypt failed: ${err.message}`)
        )
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
          _clearReconnectTimer()
          reconnectTimer = setTimeout(connect, CHECK_INTERVAL)
        } else {
          // LOGGED OUT: Baileys confirmed the stored creds are invalid.
          // Wipe the auth dir immediately and trigger a fresh connection
          // so the user sees a QR without having to navigate to the page
          // (the UI's beginPairing() flow used to do this, but it raced
          // with the page load and wiped prematurely on every open).
          momai.log('WhatsApp logged out — wiping stale auth dir for fresh re-pair')
          try {
            const fsSync = require('fs')
            if (fsSync.existsSync(authDir)) {
              fsSync.rmSync(authDir, { recursive: true, force: true })
            }
          } catch (err) {
            momai.log(`logged-out wipe failed: ${err.message}`)
          }
          lastQr = null
          lastQrAt = 0
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          _clearReconnectTimer()
          setTimeout(() => {
            connect().catch((err) =>
              momai.log(`post-loggedout connect failed: ${err.message}`)
            )
          }, 500)
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
              name: _isUsableDisplayName(c.name) ? String(c.name).trim() : null,
              notify: _isUsableDisplayName(c.notify) ? String(c.notify).trim() : null,
              verifiedName: _isUsableDisplayName(c.verifiedName)
                ? String(c.verifiedName).trim()
                : null,
              phone,
              lid: c.lid || null
            }
            added++
          } else {
            // Update existing contact with fresh data
            if (_isUsableDisplayName(c.name)) waContacts[c.id].name = String(c.name).trim()
            if (_isUsableDisplayName(c.notify)) waContacts[c.id].notify = String(c.notify).trim()
            if (_isUsableDisplayName(c.verifiedName)) {
              waContacts[c.id].verifiedName = String(c.verifiedName).trim()
            }
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
        momai.sendEvent('contacts_synced', { count: total, isFinal: false })
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
            if (_isUsableDisplayName(c.name)) existingMatch.name = String(c.name).trim()
            continue
          }
          // If no name details, skip
          if (!_pickContactLabel(c.name, c.verifiedName, c.notify)) {
            continue
          }
        }

        const phone = c.id.split('@')[0].replace(/\D/g, '')
        if (!phone) continue
        const nextName = _isUsableDisplayName(c.name) ? String(c.name).trim() : null
        const nextNotify = _isUsableDisplayName(c.notify) ? String(c.notify).trim() : null
        const nextVerified = _isUsableDisplayName(c.verifiedName)
          ? String(c.verifiedName).trim()
          : null
        waContacts[c.id] = {
          ...waContacts[c.id],
          id: c.id,
          name: nextName || waContacts[c.id]?.name || null,
          notify: nextNotify || waContacts[c.id]?.notify || null,
          verifiedName: nextVerified || waContacts[c.id]?.verifiedName || null,
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

        if (_isUsableDisplayName(u.notify)) {
          target.notify = String(u.notify).trim()
          changed++
        }
        if (_isUsableDisplayName(u.name)) {
          target.name = String(u.name).trim()
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
    isConnecting = false
    momai.log(`Connection error: ${err.message}`)
    _clearReconnectTimer()
    reconnectTimer = setTimeout(connect, 5000)
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

    const remoteJid = msg.key.remoteJid
    if (!remoteJid) continue

    const isGroup = remoteJid.endsWith('@g.us')
    const senderJid = resolveMessageSenderJid(remoteJid, msg.key.participant)
    if (!senderJid) continue

    // Self-healing LID association for incoming messages
    const lidJid = remoteJid.endsWith('@lid')
      ? remoteJid
      : senderJid.endsWith('@lid')
        ? senderJid
        : null
    if (lidJid) {
      const hasLidMapping = Object.values(waContacts).some((c) => c.lid === lidJid)
      if (!hasLidMapping && msg.pushName) {
        const match = Object.values(waContacts).find(
          (c) => !c.id.endsWith('@lid') && (c.notify === msg.pushName || c.name === msg.pushName)
        )
        if (match) {
          waContacts[match.id].lid = lidJid
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
          momai.log(
            `Self-healed JID mapping: associated LID ${lidJid} with standard JID ${match.id} via pushName "${msg.pushName}"`
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
      const storeJid = remoteJid.endsWith('@lid') ? remoteJid : resolvedSenderJid
      if (!storeJid.endsWith('@g.us') && !waContacts[storeJid]) {
        const phone = storeJid.split('@')[0].replace(/\D/g, '')
        if (phone) {
          waContacts[storeJid] = {
            id: storeJid,
            name: null,
            notify: _isUsableDisplayName(msg.pushName) ? String(msg.pushName).trim() : null,
            verifiedName: null,
            phone,
            ...(remoteJid.endsWith('@lid') ? { lid: remoteJid } : {})
          }
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        }
      } else if (remoteJid.endsWith('@lid') && waContacts[storeJid] && !waContacts[storeJid].lid) {
        waContacts[storeJid].lid = remoteJid
        await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
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
    const avatarTarget = isGroup
      ? remoteJid
      : remoteJid.endsWith('@lid')
        ? remoteJid
        : resolvedSenderJid
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

    // Fetch group metadata (announce status)
    let groupAnnounce = false
    if (sock && connected && isGroup) {
      // Re-fetch metadata if we don't have it or if it's potentially stale (60s)
      const cached = groupMetaCache.get(msg.key.remoteJid)
      const isMissingMetadata = !cached || !cached.data?.subject
      const isStale = cached && Date.now() - cached.fetchedAt > 60 * 1000

      if (isMissingMetadata || isStale) {
        try {
          const meta = await Promise.race([
            sock.groupMetadata(msg.key.remoteJid),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ])
          if (meta) {
            groupAnnounce = !!meta.announce
            groupMetaCache.set(msg.key.remoteJid, { data: meta, fetchedAt: Date.now() })

            // Update the subject in waContacts while we're at it
            if (meta.subject && waContacts[msg.key.remoteJid]) {
              waContacts[msg.key.remoteJid].name = meta.subject
              await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
            }
          }
        } catch (err) {
          momai.log(`Failed to fetch fresh group metadata: ${err.message}`)
          // Fallback to cache if exists
          if (cached) groupAnnounce = !!cached.data?.announce
        }
      } else {
        groupAnnounce = !!cached.data?.announce
      }
    }

    const resGroupName = isGroup
      ? resolveContactName(remoteJid) ||
        _pickContactLabel(waContacts[remoteJid]?.name, waContacts[remoteJid]?.verifiedName) ||
        'Grupo'
      : null
    const displayName = isFromMe
      ? resolvedSenderJid.split('@')[0] || resolvedSenderJid
      : resolveContactName(resolvedSenderJid)

    const replyJid = isGroup ? remoteJid : resolveStandardJid(remoteJid) || remoteJid

    chatHistory.unshift(
      enrichHistoryEntry({
        from: displayName,
        jid: remoteJid,
        senderJid,
        replyJid,
        text,
        timestamp: msg.messageTimestamp
          ? Number(msg.messageTimestamp)
          : Math.floor(Date.now() / 1000),
        direction: isFromMe ? 'outgoing' : 'incoming',
        isGroup,
        groupName: resGroupName,
        forceUpdateNames: true
      })
    )
    if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
    totalMessages++
    schedulePersistChatHistory()
    momai.log(
      `Message tracked: from=${displayName} text="${text.substring(0, 50)}" total=${totalMessages}`
    )

    const standardizedRemoteJid = resolveStandardJid(remoteJid)
    const myJidRaw = sock?.user?.id || sock?.authState?.creds?.me?.id
    const myJidStandardized = resolveStandardJid(myJidRaw)
    const myLidRaw = sock?.user?.lid || sock?.authState?.creds?.me?.lid
    // Strip device suffix from LID manually (resolveStandardJid uses corrupted waContacts mapping)
    const myLidStandardized = myLidRaw?.includes(':') && myLidRaw?.includes('@')
      ? myLidRaw.split('@')[0].split(':')[0] + '@' + myLidRaw.split('@')[1]
      : myLidRaw
    // Note to Self: message sent to own number. Compare raw and standardized JIDs.
    const isNoteToSelf =
      isFromMe &&
      !isGroup &&
      (remoteJid === myJidRaw ||
        remoteJid === myLidRaw ||
        remoteJid === myLidStandardized ||
        standardizedRemoteJid === myJidStandardized)

    const isOldMessage = msg.messageTimestamp && Number(msg.messageTimestamp) < workerStartTime

    const senderDisabled = _isContactDisabled(resolvedSenderJid)
    const remoteDisabled = _isContactDisabled(remoteJid)
    const shouldNotify =
      !notificationsDisabled &&
      !isOldMessage &&
      ((!isFromMe && !senderDisabled && !remoteDisabled) ||
        isNoteToSelf)
    momai.log(
      `[notif-debug] shouldNotify=${shouldNotify} isFromMe=${isFromMe} isOldMessage=${isOldMessage} notificationsDisabled=${notificationsDisabled} senderDisabled=${senderDisabled} remoteDisabled=${remoteDisabled} isNoteToSelf=${isNoteToSelf} remoteJid=${remoteJid} standardizedRemoteJid=${standardizedRemoteJid} resolvedSenderJid=${resolvedSenderJid} myJidRaw=${myJidRaw} myJidStandardized=${myJidStandardized} myLidRaw=${myLidRaw} myLidStandardized=${myLidStandardized} isGroup=${isGroup} disabledContacts=${JSON.stringify(disabledContacts)}`
    )
    if (shouldNotify) {
      const finalDisplayName = isGroup ? resGroupName : displayName

      // Check if I am admin in this group
      let isMeAdmin = false
      if (isGroup && groupAnnounce) {
        const meta = groupMetaCache.get(remoteJid)?.data
        const myJid = sock?.user?.id || sock?.authState?.creds?.me?.id
        const meId = resolveStandardJid(myJid)

        if (meId && meta?.participants) {
          const meParticipant = meta.participants.find((p) => resolveStandardJid(p.id) === meId)
          isMeAdmin = !!(meParticipant?.admin || meParticipant?.isSuperAdmin)

          if (isMeAdmin) {
            momai.log(`Verified: Current user is ADMIN in group ${resGroupName || remoteJid}`)
          }
        } else {
          momai.log(`Warning: Could not verify admin status for group ${remoteJid} (meId=${meId})`)
        }
      }

      momai.log(
        `[notif-debug] Sending whatsapp_notification event: contact=${finalDisplayName} isGroup=${!!isGroup} isNoteToSelf=${isNoteToSelf}`
      )
      // For self-messages, use the user's own JID (not the corrupted LID-resolved one)
      const notifContactJid = isNoteToSelf
        ? (myJidStandardized || replyJid)
        : replyJid
      momai.sendEvent('whatsapp_notification', {
        contact: finalDisplayName,
        senderName: isGroup ? displayName : undefined,
        contactJid: notifContactJid,
        senderJid,
        message: text,
        timestamp: msg.messageTimestamp,
        contactAvatar: resolveChatAvatarUrl(remoteJid, isGroup, senderJid),
        isGroup: !!isGroup,
        isNoteToSelf,
        groupName: isGroup ? resGroupName : undefined,
        isAdminsOnly: !!groupAnnounce && !isMeAdmin
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
  const validContacts = Object.values(waContacts).filter((c) => c.phone && !c.id.endsWith('@g.us'))
  return {
    connected,
    syncedContacts: validContacts.length,
    disabledCount: disabledContacts.length
  }
}

process.on('SIGINT', () => {
  reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
    .catch(() => {})
    .finally(() =>
      flushPersistedChatHistory()
        .catch(() => {})
        .finally(() => process.exit(0))
    )
})
process.on('SIGTERM', () => {
  reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
    .catch(() => {})
    .finally(() =>
      flushPersistedChatHistory()
        .catch(() => {})
        .finally(() => process.exit(0))
    )
})

// IPC listener for tool execution from LLM
process.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
      .catch(() => {})
      .finally(async () => {
        await flushPersistedChatHistory()
        process.exit(0)
      })
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
              name: _resolveWaContactDisplayName(c, c.id),
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

          const hasCredentials = _hasSavedSession()

          result = {
            connected,
            hasCredentials,
            totalMessages,
            syncedContacts: syncedContactsCount,
            disabledCount: disabledContacts.length,
            monitoredCount: monitoredContactsCount,
            ...(!connected && _qrStillValid()
              ? {
                  qr: lastQr,
                  qrExpiresIn: Math.max(1, Math.ceil((QR_TTL_MS - (Date.now() - lastQrAt)) / 1000))
                }
              : {})
          }
          break
        }
        case 'request_qr': {
          const forcePairing = Boolean(msg.payload.args?.force)
          if (connected) {
            result = { ok: true, connected: true }
            break
          }
          if (_qrStillValid() && !forcePairing) {
            _emitQrCode(lastQr)
            result = { ok: true, qr: lastQr }
            break
          }
          const fsSync = require('fs')
          const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
          if (forcePairing) {
            momai.log('request_qr: force pairing — clearing saved session')
            try {
              if (fsSync.existsSync(authDir)) {
                fsSync.rmSync(authDir, { recursive: true, force: true })
              }
            } catch (err) {
              momai.log(`force-pairing wipe failed: ${err.message}`)
            }
            lastQr = null
            lastQrAt = 0
          } else {
            momai.log(
              'request_qr: triggering connect (no wipe; loggedOut handler manages cleanup)'
            )
          }
          if (sock) {
            try {
              sock.end(undefined)
            } catch {}
            sock = null
          }
          preventAutoReconnect = false
          connect().catch((err) => momai.log(`request_qr connect failed: ${err.message}`))
          result = { ok: true, pending: true, hasCredentials: false }
          break
        }
        case 'sync_contacts': {
          momai.log('Manual contacts sync requested')
          const cleaned = _cleanupStaleContacts() || _sanitizeStoredContactNames()
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
          momai.sendEvent('contacts_synced', { count: total, isFinal: true })

          result = { ok: true, syncedContacts: total }
          break
        }
        case 'get_wa_contacts': {
          result = await _fetchPaginatedWaEntries({
            groupsOnly: false,
            search: msg.payload.args?.search,
            page: msg.payload.args?.page,
            perPage: msg.payload.args?.perPage
          })
          break
        }
        case 'get_wa_groups': {
          result = await _fetchPaginatedWaEntries({
            groupsOnly: true,
            search: msg.payload.args?.search,
            page: msg.payload.args?.page,
            perPage: msg.payload.args?.perPage
          })
          break
        }
        case 'get_history':
          if (chatHistory.length === 0) {
            await loadChatHistory()
          }
          result = {
            history: chatHistory.slice(0, 50).map(enrichHistoryEntry)
          }
          break
        case 'flush_history':
          await flushPersistedChatHistory()
          result = { ok: true, count: chatHistory.length }
          break
        case 'flush_credentials':
          try {
            const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
            const reEncrypted = await reEncryptCredsAfterBaileys(authDir)
            await flushPersistedChatHistory()
            result = { ok: true, reEncrypted, count: chatHistory.length }
          } catch (err) {
            momai.log(`flush_credentials failed: ${err.message}`)
            result = { ok: false, error: err.message }
          }
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
          lastQr = null
          lastQrAt = 0
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
        case 'update_settings': {
          const args = msg.payload.args || {}
          if (args.notificationsDisabled !== undefined) {
            notificationsDisabled = args.notificationsDisabled
          }
          await momai.storage.set(_getSettingsKey(), { notificationsDisabled })
          result = { ok: true, notificationsDisabled }
          break
        }
        case 'get_settings': {
          result = { ok: true, settings: { notificationsDisabled } }
          break
        }
        case 'panel':
          result = await getPanelData()
          break
        case 'process_notification': {
          const notifContact = msg.payload?.args?.contact || 'Desconhecido'
          const notifMessage = msg.payload?.args?.message || ''
          const isNoteToSelf = !!msg.payload?.args?.isNoteToSelf
          const isGroupNotif = !!msg.payload?.args?.isGroup
          const isPhoneNumber = /^\d+$/.test(String(notifContact).replace(/\D/g, ''))
          let ttsText
          if (isNoteToSelf) {
            ttsText = `Você enviou para si mesmo: ${notifMessage}`
          } else if (isPhoneNumber) {
            ttsText = `Um número desconhecido disse: ${notifMessage}`
          } else {
            ttsText = `${notifContact} disse: ${notifMessage}`
          }
          const quickReplies = []
          if (notifMessage) {
            quickReplies.push(`Obrigado pela mensagem, ${notifContact}!`)
            quickReplies.push(`Vou verificar e respondo em breve.`)
          }
          result = {
            quickReplies,
            tts: ttsText
          }
          break
        }
        default: {
          // Voice command via "responda": reply to last contact
          const lastIncoming = chatHistory.find((m) => m.direction === 'incoming')
          const cmdContent = String(msg.payload?.content || '')
            .toLowerCase()
            .trim()

          if (
            lastIncoming &&
            (cmdContent.startsWith('responda') || cmdContent.startsWith('responde'))
          ) {
            const replyMsg = msg.payload.content.replace(/^(responda|responde)\s+/i, '').trim()
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
