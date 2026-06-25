import { useEffect, useRef, useState, useCallback } from 'react'
import { XMarkIcon, MicrophoneIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import ImageViewer from 'momai:image-viewer'
import { API_URL } from 'momai:constants'
import { registerRenderer } from './registry-bridge'

async function rendererFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = window.api.getSessionToken()
  const headers: Record<string, any> = {
    'Content-Type': 'application/json'
  }
  if (options.headers) {
    const h = options.headers as Record<string, any> | Headers
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k] = v
      })
    } else {
      Object.assign(headers, h)
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(path, { ...options, headers })
}

type HistoryLine = {
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
}

const formatHistoryTime = (ts: number) => {
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const VOICE_LABELS: Record<string, string> = {
  listening: 'Aguardando "responda"...',
  detected: 'Ouvindo resposta...',
  complete: 'Enviando...',
  error: 'Erro ao ouvir',
  timeout: 'Fale "responda" + mensagem'
}

const getAvatarColor = (id: string) => {
  let hash = 0
  const str = id || 'default'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

const getInitials = (name: string): string => {
  if (!name) return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

function ContactAvatar({ src, name, id }: { src?: string | null; name: string; id: string }) {
  const [error, setError] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  if (src && !error) {
    return (
      <>
        <img
          src={src}
          alt={name}
          onError={() => setError(true)}
          className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            setShowViewer(true)
          }}
        />
        {showViewer && <ImageViewer src={src} alt={name} onClose={() => setShowViewer(false)} />}
      </>
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
    </div>
  )
}

registerRenderer('whatsapp-panel', WhatsAppNotificationCard)

  const isPhone = /^[+\d\s().-]*$/.test(name)
  return (
    <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-border/40 flex items-center justify-center text-lg shrink-0">
      {isPhone ? '📱' : '👤'}
    </div>
  )
}

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  const senderName = data?.senderName
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const conversationHistory: HistoryLine[] = data?.conversationHistory || []
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const isAdminsOnly = data?.isAdminsOnly || false
  const onClose = data?.onClose || (() => {})

  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  >('idle')
  const [customText, setCustomText] = useState('')
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const historyScrollRef = useRef<HTMLDivElement | null>(null)
  /** Bumped on manual/quick-reply send so in-flight voice sends are ignored */
  const interactionGenRef = useRef(0)

  useEffect(() => {
    setCustomText('')
    setSending(false)
    interactionGenRef.current += 1
  }, [contactJid, message, conversationHistory.length])

  useEffect(() => {
    const el = historyScrollRef.current
    if (!el || conversationHistory.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [contactJid, conversationHistory.length])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const expandQuickReply = useCallback(
    async (intent: string) => {
      const displayContact = senderName || contact
      try {
        const res = await rendererFetch(`${API_URL}/extensions/llm/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: [
              'Escreva APENAS o texto de uma mensagem de WhatsApp a ser enviada.',
              `Contato: ${displayContact}`,
              isGroup ? `Grupo: ${groupName}` : '',
              conversationHistory.length > 0
                ? `Historico recente:\n${conversationHistory
                    .map((l) =>
                      l.direction === 'incoming'
                        ? `${l.from || contact}: ${l.text}`
                        : `Voce: ${l.text}`
                    )
                    .join('\n')}`
                : `Mensagem recebida: "${message}"`,
              `Intencao: ${intent}`,
              'Resposta curta e natural em portugues, sem aspas nem explicacao.'
            ]
              .filter(Boolean)
              .join('\n')
          })
        })
        const data = await res.json().catch(() => ({}))
        const expanded = (data?.text || '').trim()
        return expanded || intent
      } catch {
        return intent
      }
    },
    [contact, senderName, message, isGroup, groupName, conversationHistory]
  )

  const beginUserSend = useCallback(() => {
    stop()
    setVoiceStatus('idle')
    return ++interactionGenRef.current
  }, [stop])

  const sendReply = useCallback(
    async (text: string, gen: number) => {
      const body = text?.trim()
      if (!body || gen !== interactionGenRef.current) {
        if (gen === interactionGenRef.current) setSending(false)
        return
      }

      setSending(true)
      try {
        const res = await rendererFetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'send_message',
            args: { contact: contactJid, message: body }
          })
        })
        const data = await res.json().catch(() => ({}))
        if (gen !== interactionGenRef.current) return
        if (!res.ok || data?.ok === false) {
          console.error('[WhatsAppNotificationCard] sendReply failed:', data?.error)
          setSending(false)
          return
        }
        setCustomText('')
        setSending(false)
        onClose()
      } catch (err) {
        if (gen !== interactionGenRef.current) return
        console.error('[WhatsAppNotificationCard] sendReply error:', err)
        setSending(false)
      }
    },
    [contactJid, onClose]
  )

  const handleQuickReply = useCallback(
    async (label: string) => {
      if (sending) return
      const gen = beginUserSend()
      setSending(true)
      try {
        const messageToSend = await expandQuickReply(label)
        await sendReply(messageToSend, gen)
      } catch (err) {
        console.error('[WhatsAppNotificationCard] handleQuickReply error:', err)
        if (gen === interactionGenRef.current) setSending(false)
      }
    },
    [beginUserSend, expandQuickReply, sendReply, sending]
  )

  useEffect(() => {
    if (!contactJid) return

    const controller = new AbortController()
    abortRef.current = controller
    const voiceGen = interactionGenRef.current
    let cancelled = false

    setVoiceStatus('listening')
    ;(async () => {
      try {
        const res = await rendererFetch(`${API_URL}/voice/whatsapp/reply/wait`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_jid: contactJid }),
          signal: controller.signal
        })

        if (cancelled || !res.ok) return

        const result = await res.json()
        if (cancelled || voiceGen !== interactionGenRef.current) return

        if (result.text?.trim()) {
          setVoiceStatus('complete')
          await sendReply(result.text.trim(), voiceGen)
        } else if (result.status === 'timeout') {
          setVoiceStatus('timeout')
        } else {
          setVoiceStatus('idle')
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'AbortError') {
          setVoiceStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [contactJid, sendReply])

  if (!data) return null

  const voiceLabel = VOICE_LABELS[voiceStatus]

  return (
    <div
      className="flex flex-col w-full max-w-md max-h-[calc(100vh-2rem)] mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border/40 bg-sidebar/30"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <ContactAvatar
            src={data?.contactAvatar}
            name={isGroup ? groupName : contact}
            id={contactJid}
          />
        </div>
        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold text-text truncate">
            {isGroup ? groupName : contact}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-text-muted font-medium">
              {isGroup ? `${senderName || contact} no WhatsApp` : 'WhatsApp'}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="#25D366"
              strokeWidth="1.4"
              aria-hidden
            >
              <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
              <path
                d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
                fill="#25D366"
                stroke="none"
              />
            </svg>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          aria-label="Fechar"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 gap-3 p-4"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {conversationHistory.length > 0 ? (
          <div
            ref={historyScrollRef}
            className="min-h-[8rem] max-h-[min(17.5rem,calc(100vh-15rem))] flex-1 overflow-y-auto overscroll-contain custom-scrollbar rounded-lg bg-black/20 scroll-pt-3 scroll-pb-3"
          >
            <div className="px-3 py-2 space-y-3 select-text">
              {conversationHistory.map((line, i) => (
                <div
                  key={`${line.timestamp}-${i}`}
                  className={
                    line.direction === 'outgoing' ? 'pl-3 border-l-2 border-accent/40' : 'pl-0.5'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium select-text ${
                        line.direction === 'outgoing' ? 'text-accent' : 'text-text-muted'
                      }`}
                    >
                      {line.direction === 'outgoing' ? 'Você' : line.from || contact}
                    </span>
                    <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                      {formatHistoryTime(line.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-text/80 mt-0.5 whitespace-pre-wrap break-words select-text">
                    {line.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text/80 shrink-0 select-text">{message}</p>
        )}

        {isAdminsOnly ? (
          <div className="flex items-center justify-center py-2 px-3 rounded-lg bg-black/10 border border-white/5">
            <p className="text-[11px] text-text-muted">
              Somente <span className="text-green-500 font-bold">admins</span> podem enviar
              mensagens
            </p>
          </div>
        ) : (
          <div
            className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg bg-input border border-border focus-within:border-accent/40 transition-colors ${
              sending ? 'cursor-default' : 'cursor-text'
            }`}
            onMouseDown={(e) => {
              if (sending) return
              const target = e.target as HTMLElement
              if (target.closest('button') || target.tagName === 'INPUT') return
              e.preventDefault()
              inputRef.current?.focus()
            }}
          >
            <MicrophoneIcon
              className={`w-4 h-4 shrink-0 pointer-events-none ${
                voiceStatus === 'listening'
                  ? 'text-green-400 animate-pulse'
                  : voiceStatus === 'detected' || voiceStatus === 'complete'
                    ? 'text-green-400'
                    : 'text-text-muted'
              }`}
              title={voiceLabel}
            />
            <input
              ref={inputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customText.trim() && !sending) {
                  e.preventDefault()
                  const gen = beginUserSend()
                  sendReply(customText.trim(), gen)
                }
              }}
              readOnly={sending}
              placeholder="Digite uma mensagem..."
              className={`flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none ${
                sending ? 'opacity-50 cursor-default' : 'cursor-text'
              }`}
            />
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (customText.trim() && !sending) {
                  const gen = beginUserSend()
                  sendReply(customText.trim(), gen)
                }
              }}
              disabled={!customText.trim() || sending}
              className={`p-1 rounded-md text-text-muted hover:text-text transition-colors disabled:opacity-40 shrink-0 ${
                !customText.trim() || sending ? 'cursor-default' : 'cursor-pointer'
              }`}
              aria-label="Enviar"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {quickReplies.length > 0 && !isAdminsOnly && (
          <div className="flex shrink-0 flex-wrap gap-2 pt-0.5 pb-0.5">
            {quickReplies.map((reply: string, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => handleQuickReply(reply)}
                disabled={sending}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-white/[0.03] text-text-muted hover:text-text hover:bg-white/5 transition-all disabled:opacity-40 ${
                  sending ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
