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

const WHITELIST_KEY = 'whitelist'
const CONTACT_NAMES_KEY = 'contact_names'
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
      if (serialized.length > 1024 * 1024) throw new Error('Storage quota exceeded')
      await fs.writeFile(path.join(_storageBase, `${key}.json`), serialized, 'utf-8')
    }
  }
}

let sock = null
let whitelist = []
let contactNames = {}
let connected = false
let chatHistory = []
let totalMessages = 0

async function main() {
  // Signal ready
  process.send({ type: 'ready' })

  // Load whitelist
  whitelist = (await momai.storage.get(WHITELIST_KEY)) || []
  contactNames = (await momai.storage.get(CONTACT_NAMES_KEY)) || {}

  // Start connection
  await connect()
}

async function connect() {
  try {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(momai.storage.storageDir, 'baileys-auth')
    )

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      emitOwnEvents: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      const { qr, connection, lastDisconnect } = update

      if (qr) {
        momai.sendEvent('qr_code', { qr, expiresIn: 30 })
      }

      if (connection === 'open') {
        connected = true
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

    // Use participant JID for groups, remoteJid for 1:1
    const senderJid = msg.key.participant || msg.key.remoteJid
    if (!senderJid) continue
    const rawNumber = senderJid.split('@')[0] || senderJid
    // Try custom name by JID, by raw number, by digits-only match, then fallback
    let displayName = rawNumber
    if (!isFromMe) {
      displayName = contactNames[senderJid] || contactNames[rawNumber] || rawNumber
      if (displayName === rawNumber) {
        const digitsOnly = rawNumber.replace(/\D/g, '')
        for (const key of Object.keys(contactNames)) {
          const keyDigits = String(key).replace(/\D/g, '')
          if (keyDigits && (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))) {
            displayName = contactNames[key]
            break
          }
        }
      }
    }

    // Track ALL messages in history
    chatHistory.unshift({
      from: displayName,
      jid: senderJid,
      text,
      timestamp: msg.messageTimestamp,
      direction: isFromMe ? 'outgoing' : 'incoming'
    })
    if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
    totalMessages++
    momai.log(`Message tracked: from=${displayName} text="${text.substring(0, 50)}" total=${totalMessages}`)

    // Notify for: self-messages (fromMe always), or whitelisted incoming messages
    const shouldNotify = isFromMe || whitelist.some(function(w) {
      const wDigits = String(w).replace(/\D/g, '')
      const dDigits = rawNumber.replace(/\D/g, '')
      return senderJid.includes(w) || w === senderJid || w === rawNumber || (dDigits && wDigits && (dDigits.endsWith(wDigits) || wDigits.endsWith(dDigits)))
    })
    if (shouldNotify) {
      momai.sendEvent('whatsapp_notification', {
        contact: displayName,
        contactJid: senderJid,
        message: text,
        timestamp: msg.messageTimestamp
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
  return { ok: true }
}

async function getPanelData() {
  return {
    connected,
    whitelist: whitelist.map((w) => ({
      id: w,
      name: contactNames[w] || w,
      number: w
    }))
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
            momai.log(`send_message OK: to=${msg.payload.args?.contact} msg="${(msg.payload.args?.message || '').substring(0, 50)}"`)
            result.directResponse = `Mensagem enviada`
          } catch (err) {
            momai.log(`send_message FAILED: ${err.message}`)
            result = { ok: false, error: err.message, directResponse: `Erro ao enviar: ${err.message}` }
          }
          break
        case 'list_contacts':
          result = { contacts: whitelist.map((w) => ({ id: w, name: contactNames[w] || w })) }
          break
        case 'add_contact':
          if (msg.payload.args?.contact) {
            whitelist.push(msg.payload.args.contact)
            await momai.storage.set(WHITELIST_KEY, whitelist)
            result = { ok: true, contact: msg.payload.args.contact }
          }
          break
        case 'remove_contact':
          whitelist = whitelist.filter((w) => w !== msg.payload.args?.contact)
          await momai.storage.set(WHITELIST_KEY, whitelist)
          result = { ok: true, contact: msg.payload.args?.contact }
          break
        case 'set_contact_name':
          if (msg.payload.args?.contact && msg.payload.args?.name) {
            contactNames[msg.payload.args.contact] = msg.payload.args.name
            await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
            result = { ok: true }
          }
          break
        case 'get_stats':
          result = {
            connected,
            totalMessages,
            totalContacts: whitelist.length,
            whitelist: whitelist.map((w) => ({ id: w, name: contactNames[w] || w, number: w }))
          }
          break
        case 'get_history':
          result = { history: chatHistory.slice(0, 20) }
          break
        case 'panel':
          result = await getPanelData()
          break
        default: {
          // Voice command via "responda": reply to last contact
          const lastIncoming = [...chatHistory].reverse().find(m => m.direction === 'incoming')
          if (lastIncoming && msg.payload?.content && msg.payload.content.toLowerCase().includes('responda')) {
            const replyMsg = msg.payload.content.replace(/responda\s+/i, '').trim()
            if (replyMsg) {
              await sendMessage(lastIncoming.jid, replyMsg)
              result = { ok: true, to: lastIncoming.from, message: replyMsg, directResponse: `Mensagem enviada para ${lastIncoming.from}` }
            } else {
              result = { ok: false, error: 'mensagem vazia', directResponse: 'Fale a mensagem depois de responda' }
            }
          } else if (lastIncoming && msg.payload?.content && msg.payload.content.toLowerCase().startsWith('responda')) {
            const replyMsg = msg.payload.content.replace(/^responda\s+/i, '').trim()
            if (replyMsg) {
              await sendMessage(lastIncoming.jid, replyMsg)
              result = { ok: true, to: lastIncoming.from, message: replyMsg, directResponse: `Mensagem enviada para ${lastIncoming.from}` }
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
