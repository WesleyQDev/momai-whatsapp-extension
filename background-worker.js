// scripts/skills/packaged/whatsapp/background-worker.js
// Persistent worker for WhatsApp Web connection via Baileys

const MAX_HISTORY = 50

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion
try {
  const baileys = require('@whiskeysockets/baileys')
  makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket
  useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState
  DisconnectReason = baileys.DisconnectReason
  fetchLatestBaileysVersion =
    baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion
  process.send({ type: 'log', message: 'Baileys loaded successfully' })
} catch (err) {
  process.send({ type: 'log', message: `Baileys load error: ${err.message}` })
  process.exit(1)
}
const path = require('path')
const fs = require('node:fs/promises')

const DISABLED_CONTACTS_KEY = 'disabled_contacts'
const CONTACT_NAMES_KEY = 'contact_names'
const WA_CONTACTS_KEY = 'wa_contacts'
const CHECK_INTERVAL = 5000

// Self-contained momai bridge (not loaded via extension-host-worker)
const _skillId = process.env.MOMAI_EXTENSION_ID || 'whatsapp'
const _dataDir =
  process.env.MOMAI_DATA_DIR || path.resolve(__dirname, '..', '..', '..', '..', 'data')
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

let sock = null
let disabledContacts = []
let contactNames = {}
let waContacts = {}
let connected = false
let chatHistory = []
let totalMessages = 0
let _currentPhone = null

function _getDisabledContactsKey() {
  return _currentPhone ? `disabled_contacts-${_currentPhone}` : DISABLED_CONTACTS_KEY
}

function _getContactNamesKey() {
  return _currentPhone ? `contact_names-${_currentPhone}` : CONTACT_NAMES_KEY
}

function _getWaContactsKey() {
  return _currentPhone ? `wa_contacts-${_currentPhone}` : WA_CONTACTS_KEY
}

function resolveContactName(jid) {
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

function _isContactDisabled(jid) {
  const rawNumber = (jid || '').split('@')[0] || jid
  const digitsOnly = rawNumber.replace(/\D/g, '')
  return disabledContacts.some((d) => {
    const dDigits = String(d).replace(/\D/g, '')
    return d === jid || d === rawNumber || (dDigits && digitsOnly && (dDigits.endsWith(digitsOnly) || digitsOnly.endsWith(dDigits)))
  })
}

function _cleanupStaleContacts() {
  let changed = false
  for (const key of Object.keys(waContacts)) {
    if (key.endsWith('@lid')) {
      delete waContacts[key]
      changed = true
      delete contactNames[key]
      const rawNumber = key.split('@')[0]
      if (rawNumber) {
        delete contactNames[rawNumber]
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
    }
  } catch {
    momai.log('_loadPerPhoneData: no creds.json (fresh start)')
  }
}

async function main() {
  // Signal ready
  process.send({ type: 'ready' })

  // Load whitelist (generic fallback)
  disabledContacts = (await momai.storage.get(DISABLED_CONTACTS_KEY)) || []
  contactNames = (await momai.storage.get(CONTACT_NAMES_KEY)) || {}
  waContacts = (await momai.storage.get(WA_CONTACTS_KEY)) || {}

  // Try to load per-phone data from existing creds
  await _loadPerPhoneData()

  if (_cleanupStaleContacts()) {
    await momai.storage.set(WA_CONTACTS_KEY, waContacts)
    await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
    momai.log('Automatically cleaned up stale @lid contacts from fallback storage')
  }

  // Start connection
  await connect()
}

async function connect() {
  try {
    const { version } = await fetchLatestBaileysVersion()
    const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
    const hasCreds = require('fs').existsSync(path.join(authDir, 'creds.json'))
    momai.log(`connect: creds.json=${hasCreds}`)
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      emitOwnEvents: false
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
        } catch { }
        momai.sendEvent('authenticated', { status: 'connected' })
        momai.log('WhatsApp connected')
      } else if (connection === 'close') {
        connected = false
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) {
          momai.sendEvent('connection_status', { status: 'reconnecting' })
          setTimeout(connect, CHECK_INTERVAL)
        } else {
          momai.sendEvent('authenticated', { status: 'logged_out' })
        }
      }
    })

    sock.ev.on('messaging-history.set', ({ contacts: syncedContacts }) => {
      if (!syncedContacts?.length) return
      momai.log(`History sync: received ${syncedContacts.length} contacts`)
      let added = 0
      for (const c of syncedContacts) {
        if (!c.id || c.id.endsWith('@lid')) continue
        const phone = c.id.split('@')[0].replace(/\D/g, '')
        if (!phone) continue
        waContacts[c.id] = {
          id: c.id,
          name: c.name || null,
          notify: c.notify || null,
          verifiedName: c.verifiedName || null,
          phone
        }
        added++
      }
      if (added > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => { })
        momai.sendEvent('contacts_synced', { count: Object.keys(waContacts).length })
        momai.log(`Contacts stored: ${added} new, ${Object.keys(waContacts).length} total`)
      }
    })

    sock.ev.on('contacts.upsert', (contacts) => {
      let updated = 0
      for (const c of contacts) {
        if (!c.id || c.id.endsWith('@lid')) continue
        const phone = c.id.split('@')[0].replace(/\D/g, '')
        if (!phone) continue
        waContacts[c.id] = {
          ...waContacts[c.id],
          id: c.id,
          name: c.name || waContacts[c.id]?.name || null,
          notify: c.notify || waContacts[c.id]?.notify || null,
          verifiedName: c.verifiedName || waContacts[c.id]?.verifiedName || null,
          phone
        }
        updated++
      }
      if (updated > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => { })
      }
    })

    sock.ev.on('contacts.update', (updates) => {
      let changed = 0
      for (const u of updates) {
        if (!u.id || !waContacts[u.id]) continue
        if (u.notify) { waContacts[u.id].notify = u.notify; changed++ }
        if (u.name) { waContacts[u.id].name = u.name; changed++ }
        if (u.verifiedName) { waContacts[u.id].verifiedName = u.verifiedName; changed++ }
      }
      if (changed > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => { })
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
    if (!msg.message?.conversation && !msg.message?.extendedTextMessage) continue

    const isFromMe = msg.key.fromMe
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text) continue

    const senderJid = msg.key.participant || msg.key.remoteJid
    if (!senderJid) continue

    const isGroup = msg.key.remoteJid.endsWith('@g.us')

    // Ensure group/contact exists in waContacts
    if (isGroup) {
      if (!waContacts[msg.key.remoteJid]) {
        waContacts[msg.key.remoteJid] = {
          id: msg.key.remoteJid,
          name: 'Grupo',
          phone: msg.key.remoteJid.split('@')[0]
        }
        await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => { })
      }
    } else {
      if (!senderJid.endsWith('@lid') && !waContacts[senderJid]) {
        const phone = senderJid.split('@')[0].replace(/\D/g, '')
        if (phone) {
          waContacts[senderJid] = {
            id: senderJid,
            name: null,
            notify: msg.pushName || null,
            verifiedName: null,
            phone
          }
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => { })
        }
      }
    }

    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const RETRY_DELAY = 10 * 60 * 1000 // 10 minutes on failure

    // Fetch group metadata (subject) dynamically if needed
    if (sock && connected && isGroup && (!waContacts[msg.key.remoteJid]?.name || waContacts[msg.key.remoteJid]?.name === 'Grupo')) {
      try {
        const meta = await Promise.race([
          sock.groupMetadata(msg.key.remoteJid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ])
        if (meta?.subject) {
          waContacts[msg.key.remoteJid].name = meta.subject
          await momai.storage.set(_getWaContactsKey(), waContacts)
        }
      } catch (err) {
        momai.log(`Failed to fetch group metadata: ${err.message}`)
      }
    }

    // Fetch avatar picture (group avatar if group, sender avatar if private)
    const avatarTarget = isGroup ? msg.key.remoteJid : senderJid
    if (sock && connected && waContacts[avatarTarget]) {
      const lastChecked = waContacts[avatarTarget].profilePicCheckedAt || 0
      const isFailedRecently = !waContacts[avatarTarget].profilePicUrl && (now - lastChecked < RETRY_DELAY)
      const isSuccessRecently = waContacts[avatarTarget].profilePicUrl && (now - lastChecked < ONE_DAY)

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

    const groupName = isGroup ? (waContacts[msg.key.remoteJid]?.name || 'Grupo') : null
    const displayName = isFromMe ? (senderJid.split('@')[0] || senderJid) : resolveContactName(senderJid)

    chatHistory.unshift({
      from: displayName,
      jid: msg.key.remoteJid, // Target JID for replies
      senderJid: senderJid,
      text,
      timestamp: msg.messageTimestamp,
      direction: isFromMe ? 'outgoing' : 'incoming',
      isGroup,
      groupName
    })
    if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
    totalMessages++
    momai.log(
      `Message tracked: from=${displayName} text="${text.substring(0, 50)}" total=${totalMessages}`
    )

    const shouldNotify = isFromMe || !_isContactDisabled(senderJid)
    if (shouldNotify) {
      momai.sendEvent('whatsapp_notification', {
        contact: displayName,
        contactJid: msg.key.remoteJid, // Send to group JID if group, sender JID if private
        senderJid: senderJid,
        message: text,
        timestamp: msg.messageTimestamp,
        contactAvatar: isGroup ? (waContacts[msg.key.remoteJid]?.profilePicUrl || null) : (waContacts[senderJid]?.profilePicUrl || null),
        isGroup,
        groupName
      })
    }
  }
}

async function sendMessage(contact, message) {
  if (!sock || !connected) throw new Error('WhatsApp not connected')

  let jid = contact
  if (!jid.includes('@')) {
    jid = `${jid}@s.whatsapp.net`
  }

  await sock.sendMessage(jid, { text: message })

  // Manually add the sent message to chatHistory to immediately reflect in UI
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

  // Notify frontend to refresh immediately
  momai.sendEvent('message_sent', { contact: displayName, jid })

  return { ok: true }
}

async function getPanelData() {
  return {
    connected,
    syncedContacts: Object.keys(waContacts).length,
    disabledCount: disabledContacts.length
  }
}

// IPC listener for tool execution from LLM
process.on('message', async (msg) => {
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
              return !(d === contactId || (dDigits && cDigits && (dDigits.endsWith(cDigits) || cDigits.endsWith(dDigits))))
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
        case 'get_stats':
          result = {
            connected,
            totalMessages,
            syncedContacts: Object.keys(waContacts).length,
            disabledCount: disabledContacts.length,
            monitoredCount: Object.keys(waContacts).length - disabledContacts.length
          }
          break
        case 'get_wa_contacts': {
          const search = (msg.payload.args?.search || '').toLowerCase()
          const page = parseInt(msg.payload.args?.page) || 1
          const perPage = parseInt(msg.payload.args?.perPage) || 20
          let entries = Object.values(waContacts)
            .filter((c) => c.phone && !c.id.endsWith('@g.us'))
          if (search) {
            entries = entries.filter((c) =>
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
                displayName: contactNames[c.phone] || c.name || c.notify || c.verifiedName || c.phone,
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
            const now = Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const RETRY_DELAY = 10 * 60 * 1000; // 10 minutes on failure

            // Fetch sequentially with 300ms delay to avoid rate limiting
            ; (async () => {
              for (const c of paginated) {
                const lastChecked = waContacts[c.id]?.profilePicCheckedAt || 0
                const isFailedRecently = !waContacts[c.id]?.profilePicUrl && (now - lastChecked < RETRY_DELAY)
                const isSuccessRecently = waContacts[c.id]?.profilePicUrl && (now - lastChecked < ONE_DAY)

                if (!isFailedRecently && !isSuccessRecently) {
                  // Wait 300ms between requests to avoid rate limit
                  await new Promise(resolve => setTimeout(resolve, 300))

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
                      // On failure, allow retry after RETRY_DELAY
                      waContacts[c.id].profilePicCheckedAt = now - ONE_DAY + RETRY_DELAY
                      await momai.storage.set(_getWaContactsKey(), waContacts)
                    }
                  }
                }
              }
            })().catch(() => { })
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
          result = { history: chatHistory.slice(0, 20) }
          break
        case 'logout':
          if (sock && connected) {
            momai.log('Logging out from WhatsApp...')
            connected = false
            await sock.logout()
          }
          result = { ok: true }
          break
        case 'panel':
          result = await getPanelData()
          break
        default: {
          // Voice command via "responda": reply to last contact
          const lastIncoming = [...chatHistory].reverse().find((m) => m.direction === 'incoming')
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
