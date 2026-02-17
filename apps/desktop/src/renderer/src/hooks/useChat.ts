import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Message,
  sendChatMessage,
  fetchChatHistory,
  clearChatHistory,
  stopGeneration,
  stopVoice,
  speakText,
  deleteMessage,
  setCallMode
} from '../services/api'

export function useChat() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState('default')
  const [_isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const [isCallMode, setIsCallMode] = useState(false)
  const isCallModeRef = useRef(false)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [callHistory, setCallHistory] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([])
  const messagesRef = useRef<Message[]>([])

  // Graph State
  const [graphState, setGraphState] = useState<{
    view: 'center' | 'side' | null
    content: string
    options: string[]
    optionsMap?: Record<string, string>
    uiSchema?: any
    bypass_wake_word?: boolean
  }>({ view: null, content: '', options: [], optionsMap: {}, bypass_wake_word: false })

  // Ref para as opções atuais do gráfico para o listener de voz não precisar de dependência
  const currentGraphOptionsRef = useRef<string[]>([])
  const isGraphOpenRef = useRef<boolean>(false)
  const toolTraceRef = useRef<{
    activeMsgId: string | null
    byToolId: Record<string, { msgId: string; stepIndex: number }>
  }>({ activeMsgId: null, byToolId: {} })
  const toolTracePrefix = 'TOOL_TRACE::'
  const toolTraceTextDelimiter = '\n\nTOOL_TEXT::\n'

  const isToolTraceMessage = (msg?: Message) =>
    !!msg && msg.role === 'assistant' && msg.content.startsWith(toolTracePrefix)

  const splitToolTraceContent = (content: string) => {
    if (!content.startsWith(toolTracePrefix)) return null
    const idx = content.indexOf(toolTraceTextDelimiter)
    const jsonPart =
      idx >= 0 ? content.slice(toolTracePrefix.length, idx) : content.slice(toolTracePrefix.length)
    const textPart = idx >= 0 ? content.slice(idx + toolTraceTextDelimiter.length) : ''
    return { jsonPart, textPart }
  }

  const buildToolTraceContent = (traceData: any, text: string) => {
    return `${toolTracePrefix}${JSON.stringify(traceData)}${toolTraceTextDelimiter}${text || ''}`
  }

  const parseStructuredToolResult = (value: any) => {
    if (value === undefined || value === null) return { result: '', error: '' }

    let parsed = value
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value)
      } catch {
        return { result: value, error: '' }
      }
    }

    if (parsed && typeof parsed === 'object' && 'status' in parsed) {
      if (parsed.status === 'error') {
        const errMessage = parsed.error?.message || parsed.error?.code || 'Erro de ferramenta'
        return { result: '', error: String(errMessage) }
      }
      const resultValue = parsed.result
      if (typeof resultValue === 'string') return { result: resultValue, error: '' }
      try {
        return { result: JSON.stringify(resultValue, null, 2), error: '' }
      } catch {
        return { result: String(resultValue ?? ''), error: '' }
      }
    }

    if (typeof parsed === 'string') return { result: parsed, error: '' }
    try {
      return { result: JSON.stringify(parsed, null, 2), error: '' }
    } catch {
      return { result: String(parsed), error: '' }
    }
  }

  const extractToolQuery = (args: any): string | undefined => {
    if (!args || typeof args !== 'object') return undefined
    const candidates = ['query', 'q', 'text', 'content', 'prompt', 'message', 'input']
    for (const key of candidates) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  }

  const findLastAssistantIndex = (list: Message[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].role === 'assistant') return i
    }
    return -1
  }

  const createAssistantMessageId = () =>
    `assistant:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

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

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const clearHistory = useCallback(async () => {
    // Clear local state immediately for instantaneous feedback
    setMessages([])
    setSpeakingIndex(null)
    setCallHistory([])
    toolTraceRef.current = { activeMsgId: null, byToolId: {} }
    
    // Notify other components
    window.dispatchEvent(new CustomEvent('momai_clear_history'))

    try {
      // Background actions
      await Promise.all([
        stopVoice(),
        clearChatHistory(threadId)
      ])
    } catch (err) {
      console.error('Erro ao sincronizar limpeza de histórico:', err)
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

      // Atalho para abrir a loja de extensoes sem enviar para a IA
      if (option === 'open_extensions_store') {
        window.dispatchEvent(new CustomEvent('momai_open_extensions'))
        return
      }

      if (option === 'dismiss') return

      // Envia a escolha como mensagem do usuário para a IA processar
      const userMessage: Message = { role: 'user', content: option }
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      toolTraceRef.current = { activeMsgId: null, byToolId: {} }

      // Prepara a bolha de resposta da IA
      const assistantMsgId = createAssistantMessageId()
      toolTraceRef.current.activeMsgId = assistantMsgId
      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '...' }])

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
          console.log('[DEBUG] onStatus received:', status)
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            console.log('[DEBUG] onStatus - lastIdx:', lastIdx, 'role:', updated[lastIdx]?.role)
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              const currentActivities = updated[lastIdx].activities || []
              // Check if this is an update to an existing "Buscando" entry
              const buscandoIdx = currentActivities.findIndex((a: string) => a.startsWith('Buscando'))
              if (buscandoIdx !== -1 && status.startsWith('Buscando')) {
                // Update existing Buscando entry instead of adding new one
                const updatedActivities = [...currentActivities]
                updatedActivities[buscandoIdx] = status
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  activities: updatedActivities
                }
              } else if (!currentActivities.includes(status)) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  activities: [...currentActivities, status]
                }
              }
            }
            return updated
          })
        },
        onSources: (sources) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                sources
              }
            }
            return updated
          })
        },
        onSnippets: (snippets) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                snippets
              }
            }
            return updated
          })
        },
        onCards: (cards) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                cards
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
    isCallModeRef.current = isCallMode
  }, [isCallMode])

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
        local: 'MomLocal (Qwen)'
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
        local: 'MomLocal (Qwen)'
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

    const toCompactJson = (value: any, maxLength = 900) => {
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return value
      let text = ''
      try {
        text = JSON.stringify(value, null, 2)
      } catch {
        text = String(value)
      }
      if (text.length > maxLength) {
        return `${text.slice(0, maxLength)}...`
      }
      return text
    }

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
        } else if (msg.type === 'setup_progress') {
          window.dispatchEvent(new CustomEvent('momai_setup_progress', { detail: msg.data }))
        } else if (msg.type === 'setup_complete') {
          window.dispatchEvent(new CustomEvent('momai_setup_complete', { detail: msg.data }))
        } else if (msg.type === 'navigate') {
          window.dispatchEvent(new CustomEvent('momai_navigate', { detail: msg.data }))
        } else if (msg.type === 'open_settings') {
          window.dispatchEvent(new CustomEvent('momai_open_settings', { detail: msg.data }))
        } else if (msg.type === 'set_theme') {
          window.dispatchEvent(new CustomEvent('momai_set_theme', { detail: msg.data }))
        } else if (msg.type === 'tts_start') {
          const idx = findLastAssistantIndex(messagesRef.current)
          setSpeakingIndex(idx >= 0 ? idx : null)
        } else if (msg.type === 'tts_stop') {
          setSpeakingIndex(null)
        } else if (msg.type === 'tool_start') {
          const toolId = msg.data?.id || `${msg.data?.name || 'tool'}-${Date.now()}`
          setMessages((prev) => {
            const updated = [...prev]
            const fallbackMsgId = `tool-trace:${Date.now()}`

            const ensureTraceTarget = () => {
              const active = toolTraceRef.current.activeMsgId
              if (active) {
                const activeIdx = updated.findIndex((m) => m.id === active)
                if (activeIdx >= 0) return { idx: activeIdx, msgId: active }
              }

              const latestAssistantIdx = findLastAssistantIndex(updated)
              if (latestAssistantIdx >= 0) {
                const existingId = updated[latestAssistantIdx].id || fallbackMsgId
                updated[latestAssistantIdx] = { ...updated[latestAssistantIdx], id: existingId }
                return { idx: latestAssistantIdx, msgId: existingId }
              }

              updated.push({ id: fallbackMsgId, role: 'assistant', content: '...' })
              return { idx: updated.length - 1, msgId: fallbackMsgId }
            }

            const { idx, msgId } = ensureTraceTarget()
            const current = updated[idx]
            const parsed = splitToolTraceContent(current.content)

            let traceData: any = {
              kind: 'tool_trace',
              steps: [],
              startedAt: new Date().toISOString()
            }
            let textPart = parsed?.textPart || ''
            try {
              if (parsed?.jsonPart) {
                traceData = JSON.parse(parsed.jsonPart)
              }
            } catch {
              traceData = { kind: 'tool_trace', steps: [], startedAt: new Date().toISOString() }
            }

            if (!parsed) {
              textPart = current.content && current.content !== '...' ? current.content : ''
            }

            const steps = Array.isArray(traceData.steps) ? [...traceData.steps] : []
            const stepIndex = steps.length
            steps.push({
              id: toolId,
              name: msg.data?.name || 'tool',
              status: 'running',
              args: toCompactJson(msg.data?.args),
              query: extractToolQuery(msg.data?.args),
              startedAt: new Date().toISOString()
            })

            const nextTrace = {
              ...traceData,
              kind: 'tool_trace',
              steps,
              status: 'running',
              updatedAt: new Date().toISOString()
            }

            updated[idx] = {
              ...current,
              id: msgId,
              content: buildToolTraceContent(nextTrace, textPart)
            }

            toolTraceRef.current.activeMsgId = msgId
            toolTraceRef.current.byToolId[toolId] = { msgId, stepIndex }

            return updated
          })
        } else if (msg.type === 'tool_result') {
          const toolId = msg.data?.id
          const status = msg.data?.status === 'error' ? 'error' : 'done'
          const ref = toolId ? toolTraceRef.current.byToolId[toolId] : null
          const parsedOutcome = parseStructuredToolResult(msg.data?.result)

          setMessages((prev) => {
            const updated = [...prev]
            let idx = ref ? updated.findIndex((m) => m.id === ref.msgId) : -1
            if (idx < 0) {
              idx = findLastAssistantIndex(updated)
            }
            if (idx >= 0) {
              const current = updated[idx]
              const parsed = splitToolTraceContent(current.content)
              let textPart = parsed?.textPart || ''
              let traceData: any = null

              try {
                traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
              } catch {
                traceData = null
              }

              const steps = Array.isArray(traceData?.steps) ? [...traceData.steps] : []
              const stepIndex = typeof ref?.stepIndex === 'number' ? ref.stepIndex : -1

              if (stepIndex >= 0 && steps[stepIndex]) {
                steps[stepIndex] = {
                  ...steps[stepIndex],
                  name: msg.data?.name || steps[stepIndex].name || 'tool',
                  status,
                  result: parsedOutcome.result || undefined,
                  error: parsedOutcome.error || undefined,
                  finishedAt: new Date().toISOString()
                }
              }

              const hasRunning = steps.some((s: any) => s.status === 'running')
              const nextTrace = {
                ...(traceData || {}),
                kind: 'tool_trace',
                steps,
                status: hasRunning ? 'running' : status,
                updatedAt: new Date().toISOString()
              }

              updated[idx] = {
                ...current,
                content: buildToolTraceContent(nextTrace, textPart)
              }

              if (!hasRunning) {
                toolTraceRef.current.activeMsgId = null
              }
              if (toolId) {
                delete toolTraceRef.current.byToolId[toolId]
              }
              return updated
            }

            const fallbackTrace = {
              kind: 'tool_trace',
              status,
              steps: [
                {
                  id: toolId,
                  name: msg.data?.name || 'tool',
                  status,
                  args: toCompactJson(msg.data?.args),
                  query: extractToolQuery(msg.data?.args),
                  result: parsedOutcome.result || undefined,
                  error: parsedOutcome.error || undefined,
                  finishedAt: new Date().toISOString()
                }
              ]
            }
            const fallbackAssistantIdx = findLastAssistantIndex(updated)
            if (fallbackAssistantIdx >= 0) {
              const existing = updated[fallbackAssistantIdx]
              updated[fallbackAssistantIdx] = {
                ...existing,
                content: buildToolTraceContent(
                  fallbackTrace,
                  existing.content && existing.content !== '...' ? existing.content : ''
                )
              }
              return updated
            }

            return [
              ...updated,
              { role: 'assistant', content: buildToolTraceContent(fallbackTrace, '') }
            ]
          })
        } else if (msg.type === 'fortscript_event') {
          window.dispatchEvent(new CustomEvent('momai_fortscript_event', { detail: msg }))
        } else if (msg.type === 'graph_open') {
          // Abre interface gráfica (Centro ou Lateral)
          const optionsMap = msg.data.options_map || msg.data.optionsMap
          const newGraphState = {
            view: msg.data.view,
            content: msg.data.content,
            options: msg.data.options || [],
            optionsMap,
            uiSchema: msg.data.ui_schema
          }

          if (msg.data.view === 'side' || msg.data.view === 'center') {
            setGraphState(newGraphState)
          } else {
            setGraphState({
              view: null,
              content: '',
              options: [],
              optionsMap: {},
              bypass_wake_word: false
            })
          }

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
        } else if (msg.type === 'voice_partial') {
          if (isCallModeRef.current && msg.text) {
            setCallHistory((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.role === 'user') {
                const updated = [...prev]
                updated[updated.length - 1] = { ...last, content: msg.text }
                return updated
              }
              return [...prev, { id: `user-${Date.now()}`, role: 'user', content: msg.text }].slice(-5)
            })
          }
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

          // Update call mode history
          if (isCallModeRef.current) {
            setCallHistory((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.role === 'user') {
                const updated = [...prev]
                updated[updated.length - 1] = { ...last, content: msg.content }
                return updated
              }
              return [...prev, { id: `user-${Date.now()}`, role: 'user', content: msg.content }].slice(-5)
            })
          }

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
          const assistantMsgId = createAssistantMessageId()
          toolTraceRef.current.activeMsgId = assistantMsgId
          setMessages((prev) => [
            ...prev,
            { id: assistantMsgId, role: 'assistant', content: '...' }
          ])
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
                const lastIdx = findLastAssistantIndex(updated)
                if (lastIdx >= 0) {
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
            // Update call mode history with assistant words
            if (isCallModeRef.current) {
              const cleanTokenForCall = data.token.split('__MOMAI_ACTIONS__')[0]
              if (cleanTokenForCall !== undefined) {
                setCallHistory((prevHistory) => {
                  const last = prevHistory[prevHistory.length - 1]
                  if (last && last.role === 'assistant') {
                    const history = [...prevHistory]
                    const prevContent = last.content
                    // If it's the very first token of the assistant, trim leading whitespace/newlines
                    let nextToken = cleanTokenForCall
                    if (prevContent === '...' || prevContent === '') {
                      nextToken = nextToken.replace(/^\s+/, '')
                    }
                    
                    const newContent = (prevContent === '...' ? '' : prevContent) + nextToken
                    history[history.length - 1] = {
                      ...last,
                      content: newContent
                    }
                    return history
                  }
                  
                  // New assistant message: only start if we have actual text
                  const trimmed = cleanTokenForCall.replace(/^\s+/, '')
                  if (trimmed) {
                    return [...prevHistory, { id: `assistant-${Date.now()}`, role: 'assistant', content: trimmed }].slice(-5)
                  }
                  return prevHistory
                })
              }
            }

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

                if (isToolTraceMessage(updated[lastIdx])) {
                  const parsed = splitToolTraceContent(updated[lastIdx].content)
                  let traceData: any = null
                  let textPart = parsed?.textPart || ''

                  try {
                    traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
                  } catch {
                    traceData = null
                  }

                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: buildToolTraceContent(traceData || {}, textPart + cleanToken)
                  }
                } else {
                  const finalContent = newBase + cleanToken
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: finalContent
                  }
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
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                updated[lastIdx].content = `Erro: ${data.error}`
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
        console.log(
          `Reconectando WebSocket em ${(delay / 1000).toFixed(1)}s... (tentativa ${reconnectAttempts})`
        )
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

        if (isCallModeRef.current) {
          setCallHistory((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: messageText }].slice(-5))
        }
      }

      if (!overrideText) setText('')

      setIsLoading(true)
      toolTraceRef.current = { activeMsgId: null, byToolId: {} }

      // Adiciona mensagem de expectativa do assistente para streaming
      const assistantMsgId = createAssistantMessageId()
      toolTraceRef.current.activeMsgId = assistantMsgId
      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '...' }])

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

                if (isToolTraceMessage(updated[lastIdx])) {
                  const parsed = splitToolTraceContent(updated[lastIdx].content)
                  let traceData: any = null
                  let textPart = parsed?.textPart || ''

                  try {
                    traceData = parsed?.jsonPart ? JSON.parse(parsed.jsonPart) : null
                  } catch {
                    traceData = null
                  }

                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: buildToolTraceContent(traceData || {}, textPart + token)
                  }
                } else {
                  const finalContent = newBase + token
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: finalContent
                  }
                }
                return updated
              } else {
                return [...prev, { role: 'assistant', content: token }]
              }
            })

            // Update call mode history separately
            if (isCallModeRef.current) {
              const cleanTokenForCall = token.split('__MOMAI_ACTIONS__')[0]
              if (cleanTokenForCall !== undefined) {
                setCallHistory((prevHistory) => {
                  const last = prevHistory[prevHistory.length - 1]
                  if (last && last.role === 'assistant') {
                    const history = [...prevHistory]
                    const prevContent = history[history.length - 1].content
                    // If it's the very first token of the assistant, trim leading whitespace/newlines
                    let nextToken = cleanTokenForCall
                    if (prevContent === '...' || prevContent === '') {
                      nextToken = nextToken.replace(/^\s+/, '')
                    }

                    const newContent = (prevContent === '...' ? '' : prevContent) + nextToken
                    history[history.length - 1] = {
                      role: 'assistant',
                      content: newContent
                    }
                    return history
                  }
                  
                  // New assistant message: only start if we have actual text
                  const trimmed = cleanTokenForCall.replace(/^\s+/, '')
                  if (trimmed) {
                    return [...prevHistory, { role: 'assistant', content: trimmed }].slice(-5)
                  }
                  return prevHistory
                })
              }
            }
          },
          onStatus: (status) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                const currentActivities = updated[lastIdx].activities || []
                // Check if this is an update to an existing "Buscando" entry
                const buscandoIdx = currentActivities.findIndex((a: string) => a.startsWith('Buscando'))
                if (buscandoIdx !== -1 && status.startsWith('Buscando')) {
                  // Update existing Buscando entry instead of adding new one
                  const updatedActivities = [...currentActivities]
                  updatedActivities[buscandoIdx] = status
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    activities: updatedActivities
                  }
                } else if (!currentActivities.includes(status)) {
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
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                updated[lastIdx].content = `Erro: ${error}`
              }
              return updated
            })
          },
          onSources: (sources) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  sources
                }
              }
              return updated
            })
          },
          onSnippets: (snippets) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  snippets
                }
              }
              return updated
            })
          },
          onCards: (cards) => {
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = findLastAssistantIndex(updated)
              if (lastIdx >= 0) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  cards
                }
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

  const stopCurrentGeneration = useCallback(async () => {
    try {
      await stopGeneration()
    } catch (error) {
      console.error('Erro ao parar geracao:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const stopCurrentVoice = useCallback(async () => {
    try {
      await stopVoice()
    } catch (error) {
      console.error('Erro ao parar voz:', error)
    } finally {
      setSpeakingIndex(null)
    }
  }, [])

  const speakMessage = useCallback(async (content: string, index: number) => {
    try {
      setSpeakingIndex(index)
      await speakText(content)
    } catch (error) {
      console.error('Erro ao falar mensagem:', error)
      setSpeakingIndex(null)
    }
  }, [])

const removeMessage = useCallback(async (index: number) => {
    const msg = messages[index]
    if (msg.id) {
      try {
        await deleteMessage(Number(msg.id))
      } catch (error) {
        console.error('Erro ao excluir mensagem do banco:', error)
      }
    }
    setMessages((prev) => prev.filter((_, i) => i !== index))
  }, [messages])

  const toggleCallMode = useCallback(async () => {
    const newState = !isCallMode
    setIsCallMode(newState)
    setCallHistory([])
    try {
      await setCallMode(newState)
    } catch (error) {
      console.error('Erro ao alterar modo chamada:', error)
    }
  }, [isCallMode])

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
    clearHistory,
    stopCurrentGeneration,
    stopCurrentVoice,
    speakingIndex,
    speakMessage,
    removeMessage,
    isCallMode,
    toggleCallMode,
    voiceStatus,
    callHistory
  }
}
