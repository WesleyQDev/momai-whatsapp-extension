import { useState, useRef, useEffect, useCallback } from 'react'
import { Message, sendChatMessage, fetchChatHistory, clearChatHistory } from '../services/api'

export function useChat() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState('default')
  const [_isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Graph State
  const [graphState, setGraphState] = useState<{
    view: 'center' | 'side' | null
    content: string
    options: string[]
    uiSchema?: any
    bypass_wake_word?: boolean
  }>({ view: null, content: '', options: [], bypass_wake_word: false })

  // Ref para as opções atuais do gráfico para o listener de voz não precisar de dependência
  const currentGraphOptionsRef = useRef<string[]>([])
  const isGraphOpenRef = useRef<boolean>(false)

  // Atualiza refs quando o graphState muda
  useEffect(() => {
    currentGraphOptionsRef.current = graphState.options
    isGraphOpenRef.current = graphState.view !== null
  }, [graphState])

  // Carrega histórico inicial do SQLite
  useEffect(() => {
    let retries = 0
    const maxRetries = 5
    
    const loadHistory = async () => {
      try {
        const history = await fetchChatHistory(threadId)
        // Processa histórico para adicionar flag isGraph quando graphData existe
        const processedHistory = history.map((msg) => ({
          ...msg,
          isGraph: msg.role === 'assistant' && !!msg.graphData
        }))
        setMessages(processedHistory)
        setIsHistoryLoaded(true)
      } catch (err) {
        retries++
        if (retries < maxRetries) {
          // Retry silencioso com backoff exponencial
          const delay = Math.min(500 * Math.pow(1.5, retries), 5000)
          setTimeout(loadHistory, delay)
        } else {
          // Só loga erro após todas as tentativas
          console.error('Erro ao carregar histórico:', err)
          setIsHistoryLoaded(true)
        }
      }
    }
    
    loadHistory()
  }, [threadId])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const clearHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      await clearChatHistory(threadId)
      window.dispatchEvent(new CustomEvent('momai_clear_history'))
    } catch (err) {
      console.error('Erro ao limpar histórico:', err)
    } finally {
      setIsLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    const handleClear = () => setMessages([])
    window.addEventListener('momai_clear_history', handleClear)
    return () => window.removeEventListener('momai_clear_history', handleClear)
  }, [])

  const reopenGraph = useCallback((data: any) => {
    setGraphState(data)
  }, [])

  const handleGraphOption = useCallback(
    (option: string) => {
      // Fecha o gráfico
      setGraphState((prev) => ({ ...prev, view: null }))

      // Se for apenas um "OK" de confirmação de leitura, não envia para a IA
      if (option.toUpperCase() === 'OK') return

      // Envia a escolha como mensagem do usuário para a IA processar
      const userMessage: Message = { role: 'user', content: option }
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)

      // Prepara a bolha de resposta da IA
      setMessages((prev) => [...prev, { role: 'assistant', content: '...' }])

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
        onStatus: (status) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              const currentActivities = updated[lastIdx].activities || []
              if (!currentActivities.includes(status)) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  activities: [...currentActivities, status]
                }
              }
            }
            return updated
          })
        },
        onError: (error) => {
          console.error('Erro ao enviar escolha:', error)
        },
        onDone: () => {}
      })
    },
    [threadId]
  )

  const closeGraph = useCallback(() => {
    setGraphState((prev) => ({ ...prev, view: null }))
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
    const maxReconnectAttempts = 15 // Aumentado para garantir conexão
    let isUnmounting = false
    let isBooting = true // Flag para suprimir erros durante boot

    // Desativa flag de boot após 15 segundos
    const bootTimeout = setTimeout(() => {
      isBooting = false
    }, 15000)

    const handleRemoteChange = (e: any) => {
      const { detail } = e
      console.log('[useChat] IA confirmou troca de modelo:', detail)

      const modelNames: Record<string, string> = {
        local: 'MomLocal',
        genai: 'Gemini (Cloud)',
        groq: 'Groq (Cloud)'
      }

      const modelName = modelNames[detail] || detail
      const contentPrefix = 'Brain changed to:'
      const finalContent = `${contentPrefix} **${modelName}** ✅`

      setMessages((prev) => {
        const lastIdx = prev.length - 1
        if (lastIdx < 0) return prev

        const lastMsg = prev[lastIdx]

        // 1. Se a última mensagem for uma bolha vazia (comum em trocas via voz/grafo)
        // ou se for o carregamento (⏳), atualizamos ela para check (✅)
        const isWaiting =
          lastMsg.role === 'assistant' &&
          (lastMsg.content === '' ||
            (lastMsg.content.includes(contentPrefix) && lastMsg.content.includes('⏳')))

        if (isWaiting) {
          const updated = [...prev]
          updated[lastIdx] = { ...lastMsg, content: finalContent }
          return updated
        }

        // 2. Se a última mensagem já for EXATAMENTE o que queremos adicionar, ignoramos (evita duplicidade de eventos)
        if (lastMsg.role === 'assistant' && lastMsg.content === finalContent) {
          return prev
        }

        // 3. Caso contrário (mudança via comando de voz que não passou pelo dropdown), adicionamos o card finalizado
        return [...prev, { role: 'assistant', content: finalContent }]
      })
    }

    // Listener para o INÍCIO da troca (vindo do useStatus/Dropdown ou Tool)
    const handleModelStartChange = (e: any) => {
      const { detail } = e
      const modelNames: Record<string, string> = {
        local: 'MomLocal',
        genai: 'Gemini (Cloud)',
        groq: 'Groq (Cloud)'
      }
      const modelName = modelNames[detail] || detail
      const loadingContent = `Brain changed to: **${modelName}** ⏳`

      setMessages((prev) => {
        if (prev.length === 0) return [{ role: 'assistant', content: loadingContent }]

        const updated = [...prev]
        const lastMsg = updated[updated.length - 1]

        // Se a última mensagem for do assistente e estiver vazia ou já for o loading, atualizamos ela
        if (
          lastMsg.role === 'assistant' &&
          (lastMsg.content === '' ||
            lastMsg.content === '...' ||
            lastMsg.content.includes('Cérebro alterado'))
        ) {
          updated[updated.length - 1] = { ...lastMsg, content: loadingContent }
          return updated
        }

        // Caso contrário, adicionamos uma nova bolha
        return [...updated, { role: 'assistant', content: loadingContent }]
      })
    }

    window.addEventListener('ai_model_changed', handleRemoteChange)
    window.addEventListener('ai_model_change_start', handleModelStartChange)

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
        window.dispatchEvent(new CustomEvent('momai_socket_connected'))
        reconnectAttempts = 0
      }

      ws.onmessage = (event) => {
        // Tenta processar múltiplos JSONs se vierem colados (comum em alto tráfego)
        const rawData = event.data
        const jsonObjects = rawData.match(/\{.*?\}(?=\{|$)/g) || [rawData]

        for (const jsonStr of jsonObjects) {
          try {
            const msg = JSON.parse(jsonStr)
            handleWsMessage(msg)
          } catch (e) {
            console.error('Erro ao processar JSON via WS:', e, jsonStr)
          }
        }
      }

      const handleWsMessage = (msg: any) => {
        if (msg.type === 'init_progress') {
          // Propaga evento de progresso de inicialização para useStatus
          window.dispatchEvent(new CustomEvent('momai_init_progress', { detail: msg.data }))
        } else if (msg.type === 'extensions_sync') {
          window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: msg.data }))
        } else if (msg.type === 'fortscript_event') {
          window.dispatchEvent(new CustomEvent('momai_fortscript_event', { detail: msg }))
        } else if (msg.type === 'graph_open') {
          // Abre interface gráfica (Centro ou Lateral)
          const newGraphState = {
            view: msg.data.view,
            content: msg.data.content,
            options: msg.data.options || [],
            uiSchema: msg.data.ui_schema
          }
          setGraphState(newGraphState)

          // Adiciona ou mescla o card interativo no chat
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            const lastMsg = updated[lastIdx]

            // Se a última mensagem for do assistente e não for um gráfico ainda, mesclamos
            if (lastIdx >= 0 && lastMsg.role === 'assistant' && !lastMsg.isGraph) {
              updated[lastIdx] = {
                ...lastMsg,
                isGraph: true,
                graphData: newGraphState
              }
              return updated
            }

            // Se já for um gráfico igual, ignoramos
            if (
              lastMsg?.role === 'assistant' &&
              lastMsg.isGraph &&
              lastMsg.content === msg.data.content
            ) {
              return prev
            }

            // Caso contrário, adicionamos novo
            return [
              ...prev,
              {
                role: 'assistant',
                content: msg.data.content,
                isGraph: true,
                graphData: newGraphState
              }
            ]
          })
        } else if (msg.type === 'graph_close') {
          setGraphState((prev) => ({ ...prev, view: null }))
        } else if (msg.type === 'model_changed') {
          window.dispatchEvent(new CustomEvent('ai_model_changed', { detail: msg.data.new_mode }))
        } else if (msg.type === 'model_change_start') {
          window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: msg.data.mode }))
        } else if (msg.type === 'model_change_progress') {
          // Progress is now handled via activities or global status if needed
        } else if (msg.type === 'reminder_trigger') {
          // Alerta visual de lembrete
          setGraphState({
            view: 'center',
            content: `### 🔔 Lembrete: ${msg.data.title}\n\n${msg.data.content || ''}`,
            options: ['OK'],
            bypass_wake_word: false
          })
        } else if (msg.type === 'user') {
          // Alguém falou via voice command
          const content = msg.content.toLowerCase()

          // Verifica se bate com alguma opção do gráfico aberto usando REFS
          if (isGraphOpenRef.current && currentGraphOptionsRef.current.length > 0) {
            const matchedOption = currentGraphOptionsRef.current.find(
              (opt) => content.includes(opt.toLowerCase()) || opt.toLowerCase().includes(content)
            )

            if (matchedOption) {
              handleGraphOption(matchedOption)
              return
            }

            // Suporte a Sim/Não genérico se botões forem esses
            if (content.includes('sim') || content.includes('confirmar')) {
              const yesOpt = currentGraphOptionsRef.current.find(
                (o) => o.toLowerCase() === 'sim' || o.toLowerCase() === 'confirmar'
              )
              if (yesOpt) {
                handleGraphOption(yesOpt)
                return
              }
            }
          }

          setMessages((prev) => [...prev, { role: 'user', content: msg.content }])
          setMessages((prev) => [...prev, { role: 'assistant', content: '...' }])
          setIsLoading(true)
        } else if (msg.type === 'assistant') {
          const { data } = msg

          if (data.status) {
            const statusText =
              data.status === 'thinking'
                ? 'Pensando...'
                : data.status === 'responding'
                  ? null
                  : data.status

            if (statusText) {
              setMessages((prev) => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  const currentActivities = updated[lastIdx].activities || []
                  if (!currentActivities.includes(statusText)) {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      activities: [...currentActivities, statusText]
                    }
                  }
                }
                return updated
              })
            }
          }

          if (data.token) {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1

              if (
                lastIdx >= 0 &&
                updated[lastIdx]?.role === 'assistant' &&
                !updated[lastIdx].content.startsWith('Cérebro alterado')
              ) {
                const currentContent = updated[lastIdx].content
                const newBase = currentContent === '...' ? '' : currentContent

                // Evita repetir o nome da assistente se o modelo enviar no token
                let cleanToken = data.token
                if (
                  newBase === '' &&
                  (cleanToken.toLowerCase().startsWith('momai:') ||
                    cleanToken.toLowerCase().startsWith('assistente:'))
                ) {
                  cleanToken = cleanToken.split(':')[1]?.trim() || ''
                }

                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: newBase + cleanToken
                }
                return updated
              } else {
                return [...prev, { role: 'assistant', content: data.token }]
              }
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
        // Suprimir log durante boot
        if (!isBooting) {
          console.log('Voice WebSocket desconectado.')
        }
        scheduleReconnect()
      }

      ws.onerror = (err) => {
        // Suprimir erros durante os primeiros 15s de boot
        if (!isBooting) {
          console.error('WebSocket error:', err)
        }
        ws?.close()
      }
    }

    const scheduleReconnect = () => {
      if (isUnmounting || reconnectAttempts >= maxReconnectAttempts) return

      reconnectAttempts++
      const delay = Math.min(500 * Math.pow(1.5, reconnectAttempts - 1), 10000) // Backoff mais rápido: 500ms -> 10s
      
      // Suprimir log durante boot
      if (!isBooting || reconnectAttempts > 3) {
        console.log(`Reconectando WebSocket em ${(delay / 1000).toFixed(1)}s... (tentativa ${reconnectAttempts})`)
      }

      reconnectTimeout = setTimeout(connect, delay)
    }

    connect()

    return () => {
      isUnmounting = true
      clearTimeout(bootTimeout)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) ws.close()
      window.removeEventListener('ai_model_changed', handleRemoteChange)
      window.removeEventListener('ai_model_change_start', handleModelStartChange)
    }
  }, []) // Removida dependência graphState para estabilidade

  const sendMessage = useCallback(
    async (overrideText?: string, isSilent: boolean = false) => {
      const messageText = overrideText ?? text
      if (!messageText.trim() || isLoading) return

      if (!isSilent) {
        const userMessage: Message = { role: 'user', content: messageText }
        setMessages((prev) => [...prev, userMessage])
      }

      if (!overrideText) setText('')

      setIsLoading(true)

      // Adiciona mensagem de expectativa do assistente para streaming
      setMessages((prev) => [...prev, { role: 'assistant', content: '...' }])

      try {
        await sendChatMessage(messageText, threadId, {
          onToken: (token) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (
                updated[lastIdx]?.role === 'assistant' &&
                !updated[lastIdx].content.startsWith('Cérebro alterado')
              ) {
                const currentContent = updated[lastIdx].content
                const newBase = currentContent === '...' ? '' : currentContent
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: newBase + token
                }
                return updated
              } else {
                return [...prev, { role: 'assistant', content: token }]
              }
            })
          },
          onStatus: (status) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                const currentActivities = updated[lastIdx].activities || []
                if (!currentActivities.includes(status)) {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    activities: [...currentActivities, status]
                  }
                }
              }
              return updated
            })
          },
          onError: (error) => {
            setMessages((prev) => {
              const updated = [...prev]
              if (updated[updated.length - 1]) {
                updated[updated.length - 1].content = `Erro: ${error}`
              }
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
          if (updated[updated.length - 1]) {
            updated[updated.length - 1].content =
              error instanceof Error ? error.message : 'Erro ao processar mensagem'
          }
          return updated
        })
      } finally {
        setIsLoading(false)
      }
    },
    [text, isLoading, threadId]
  )

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
    reopenGraph,
    clearHistory
  }
}
