// scripts/skills/packaged/whatsapp/background-worker.js
// Persistent worker for WhatsApp Web connection via Baileys

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const path = require('path')

const WHITELIST_KEY = 'whitelist'
const CONTACT_NAMES_KEY = 'contact_names'
const CHECK_INTERVAL = 5000

let sock = null
let whitelist = []
let contactNames = {}
let connected = false

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
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
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
    if (msg.key.fromMe) continue
    if (!msg.message?.conversation && !msg.message?.extendedTextMessage) continue

    const contact = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text || !contact) continue

    // Check whitelist
    const isWhitelisted = whitelist.some((w) => contact.includes(w) || w === contact)
    if (!isWhitelisted) continue

    // Resolve display name
    const displayName = contactNames[contact] || contact.split('@')[0] || contact

    // Send notification
    momai.sendEvent('whatsapp_notification', {
      contact: displayName,
      contactJid: contact,
      message: text,
      timestamp: msg.messageTimestamp
    })
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
          result = await sendMessage(msg.payload.args?.contact, msg.payload.args?.message)
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
        case 'panel':
          result = await getPanelData()
          break
        default:
          result = await getPanelData()
      }
      process.send({ type: 'response', requestId: msg.requestId, result })
    } catch (err) {
      process.send({ type: 'response', requestId: msg.requestId, result: { ok: false, error: err.message } })
    }
  }
})

main().catch((err) => {
  momai.log(`Fatal error: ${err.message}`)
  process.exit(1)
})
