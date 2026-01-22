import { useState, useRef, useEffect, useCallback } from 'react'
import { Message, sendChatMessage } from '../services/api'

export function useChat() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState(() => `thread_${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 10
    let isUnmounting = false

    const connect = () => {
      if (isUnmounting) return

      try {
        ws = new WebSocket('ws://127.0.0.1:8000/ws')
      } catch (e) {
        console.error('Erro ao criar WebSocket:', e)
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        console.log('Voice WebSocket conectado!')
        reconnectAttempts = 0
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'user') {
          // Alguém falou via voice command
          setMessages((prev) => [...prev, { role: 'user', content: msg.content }])
          setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
          setIsLoading(true)
        } else if (msg.type === 'assistant') {
          const { data } = msg

          if (data.token) {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (updated[lastIdx]?.role === 'assistant') {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + data.token
                }
              }
              return updated
            })
          }

          if (data.done) {
            setIsLoading(false)
          }

          if (data.error) {
            setMessages((prev) => {
              const updated = [...prev]
              if (updated[updated.length - 1]?.role === 'assistant') {
                updated[updated.length - 1].content = `Erro: ${data.error}`
              }
              return updated
            })
            setIsLoading(false)
          }
        }
      }

      ws.onclose = () => {
        console.log('Voice WebSocket desconectado.')
        scheduleReconnect()
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        ws?.close()
      }
    }

    const scheduleReconnect = () => {
      if (isUnmounting || reconnectAttempts >= maxReconnectAttempts) return

      reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000) // Exponential backoff, max 30s
      console.log(`Reconectando WebSocket em ${delay / 1000}s... (tentativa ${reconnectAttempts})`)

      reconnectTimeout = setTimeout(connect, delay)
    }

    connect()

    return () => {
      isUnmounting = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      ws?.close()
    }
  }, [])

  const sendMessage = useCallback(async () => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    const currentText = text
    setText('')
    setIsLoading(true)

    // Adiciona mensagem vazia do assistente para streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      await sendChatMessage(currentText, threadId, {
        onToken: (token) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + token
            }
            return updated
          })
        },
        onError: (error) => {
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1].content = `Erro: ${error}`
            return updated
          })
        },
        onDone: () => {
          // Stream finalizado
        }
      })
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1].content =
          error instanceof Error ? error.message : 'Erro ao processar mensagem'
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }, [text, isLoading, threadId])

  return {
    text,
    setText,
    messages,
    isLoading,
    sendMessage,
    messagesEndRef
  }
}
