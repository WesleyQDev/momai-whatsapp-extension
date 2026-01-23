import { useState, useRef, useEffect, useCallback } from 'react'
import { Message, sendChatMessage } from '../services/api'

export function useChat() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat_history')
    return saved ? JSON.parse(saved) : []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState(() => `thread_${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages))
  }, [messages])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const AUTO_SIDE_PANEL_THRESHOLD = 600

  // Graph State
  const [graphState, setGraphState] = useState<{
    view: 'center' | 'side' | null
    content: string
    options: string[]
    uiSchema?: any
    isAutoOverflow?: boolean
  }>({ view: null, content: '', options: [] })

  const openDetails = useCallback((content: string) => {
      setGraphState({
          view: 'side',
          content: content,
          options: [],
          isAutoOverflow: false // Manual open
      })
  }, [])

  // Heurística de Auto-Overflow (Texto Longo -> Painel Lateral)
  useEffect(() => {
    if (!isLoading || messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return

    // Se exceder o limite
    if (lastMsg.content.length > AUTO_SIDE_PANEL_THRESHOLD) {
      setGraphState(prev => {
        // Se já estiver aberto em modo overflow ou side manual, apenas atualiza o conteúdo
        if (prev.view === 'side') {
           return { ...prev, content: lastMsg.content }
        }
        
        // Se não estiver aberto e não for um modal bloqueante (center), abre agora
        if (prev.view !== 'center') {
            return {
                view: 'side',
                content: lastMsg.content,
                options: [],
                isAutoOverflow: true
            }
        }
        return prev
      })
    }
  }, [messages, isLoading])

  const handleGraphOption = (option: string) => {
    // Fecha o gráfico (exceto se for 'side' informativo persistente? 
    // Por enquanto fecha se for ação de escolha/botão)
    setGraphState(prev => ({ ...prev, view: null }))

    // Envia a escolha como mensagem do usuário para a IA processar
    const userMessage: Message = { role: 'user', content: option }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    // Prepara a bolha de resposta da IA
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    // Envia para o backend
    sendChatMessage(option, threadId, {
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
           console.error("Erro ao enviar escolha:", error)
        },
        onDone: () => {}
    })
  }

  const closeGraph = useCallback(() => {
    setGraphState(prev => ({ ...prev, view: null }))
  }, [])

  // Fecha gráfico com ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGraph()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeGraph])


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

        if (msg.type === 'graph_open') {
          // Abre interface gráfica (Centro ou Lateral)
          setGraphState({
            view: msg.data.view,
            content: msg.data.content,
            options: msg.data.options || [],
            uiSchema: msg.data.ui_schema
          })
        } else if (msg.type === 'graph_close') {
          setGraphState(prev => ({ ...prev, view: null }))
        } else if (msg.type === 'model_changed') {
           window.dispatchEvent(new CustomEvent('ai_model_changed', { detail: msg.data.new_mode }))
        } else if (msg.type === 'user') {
          // Alguém falou via voice command
          const content = msg.content.toLowerCase()
          
          // Verifica se bate com alguma opção do gráfico aberto
          // Lógica fuzzy simples: se a opção estiver contida na fala ou vice-versa
          if (graphState.view && graphState.options.length > 0) {
             const matchedOption = graphState.options.find(opt => 
                content.includes(opt.toLowerCase()) || opt.toLowerCase().includes(content)
             )
             
             if (matchedOption) {
                handleGraphOption(matchedOption)
                return
             }
             
             // Suporte a Sim/Não genérico se botões forem esses
             if (content.includes('sim') || content.includes('confirmar')) {
                 const yesOpt = graphState.options.find(o => o.toLowerCase() === 'sim' || o.toLowerCase() === 'confirmar')
                 if (yesOpt) { handleGraphOption(yesOpt); return }
             }
          }

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
  }, [graphState]) // Dependência graphState para o listener de voz ter acesso ao estado atual

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
    messagesEndRef,
    graphState,
    handleGraphOption,
    closeGraph,
    openDetails,
    AUTO_SIDE_PANEL_THRESHOLD
  }
}
