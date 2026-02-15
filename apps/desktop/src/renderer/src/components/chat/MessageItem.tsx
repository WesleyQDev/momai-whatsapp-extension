import { JSX, memo, useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  SparklesIcon,
  GlobeAltIcon,
  BellIcon,
  ComputerDesktopIcon,
  CpuChipIcon,
  ArrowsRightLeftIcon
} from '@heroicons/react/24/outline'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  isSpeaking?: boolean
  onStopVoice?: () => void
  onStopGeneration?: () => void
}

const MessageItem = memo(function MessageItem({
  message,
  isLoading = false,
  onReopenGraph,
  onGraphOption,
  isSpeaking = false,
  onStopVoice,
  onStopGeneration
}: MessageItemProps): JSX.Element {
  const [showTrace, setShowTrace] = useState(true)
  const [showToolDetails, setShowToolDetails] = useState(true)
  const [openToolIndex, setOpenToolIndex] = useState<number | null>(null)
  const [hideStopButton, setHideStopButton] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<Record<number, number>>({})
  const startTimesRef = useRef<Record<number, number>>({})

  const handleStopVoiceClick = () => {
    if (!onStopVoice) return
    onStopVoice()
    setHideStopButton(true)
  }

  useEffect(() => {
    if (isSpeaking) {
      setHideStopButton(false)
    }
  }, [isSpeaking])

  const isSystemModelChange =
    message.role === 'assistant' && message.content.startsWith('Brain changed to:')
  const isDone = message.content.includes('✅')

  const toolTracePrefix = 'TOOL_TRACE::'
  const toolTraceTextDelimiter = '\n\nTOOL_TEXT::\n'
  const isToolTrace = message.role === 'assistant' && message.content.startsWith(toolTracePrefix)
  let toolTrace: { status?: string; steps?: any[] } | null = null
  let toolTraceText = ''

  if (isToolTrace) {
    try {
      const idx = message.content.indexOf(toolTraceTextDelimiter)
      const jsonPart =
        idx >= 0
          ? message.content.slice(toolTracePrefix.length, idx)
          : message.content.slice(toolTracePrefix.length)
      toolTraceText = idx >= 0 ? message.content.slice(idx + toolTraceTextDelimiter.length) : ''
      toolTrace = JSON.parse(jsonPart)
    } catch {
      toolTrace = { status: 'error', steps: [] }
    }
  }

  const isChatCard = message.role === 'assistant' && message.graphData?.view === 'chat'
  const displayContent =
    message.content === '...'
      ? ''
      : isChatCard && message.graphData?.content
        ? message.graphData.content
        : isToolTrace
          ? toolTraceText
          : message.content
  const optionsMap = message.graphData?.optionsMap || message.graphData?.options_map || {}
  const toolSteps = Array.isArray(toolTrace?.steps) ? toolTrace.steps : []
  const filteredActivities = (message.activities || []).filter(
    (a) => !a.toLowerCase().includes('running capability')
  )
  
  const displayActivities = filteredActivities
  const totalStagesCount = displayActivities.length + toolSteps.length
  const hasStageData = totalStagesCount > 0

  const completedSteps = toolSteps.filter((s) => s.status === 'done').length
  const errorSteps = toolSteps.filter((s) => s.status === 'error').length
  const runningSteps = toolSteps.filter((s) => s.status === 'running').length
  
  // "Gerando resposta" phase: loading but no running steps (tools finished, generating final response)
  const isGeneratingResponse = isLoading && runningSteps === 0 && toolSteps.length > 0
  
  // Compute if trace should be visible - show when loading and has stages, or when explicitly shown
  const shouldShowTrace = (isLoading && hasStageData) || showTrace

  // Track start time for running steps
  useEffect(() => {
    const newStartTimes: Record<number, number> = {}
    toolSteps.forEach((step, idx) => {
      if (step.status === 'running') {
        if (!startTimesRef.current[idx]) {
          newStartTimes[idx] = Date.now()
        } else {
          newStartTimes[idx] = startTimesRef.current[idx]
        }
      }
    })
    if (Object.keys(newStartTimes).length > 0) {
      startTimesRef.current = { ...startTimesRef.current, ...newStartTimes }
    }
  }, [toolSteps])

  // Update elapsed seconds every second
  useEffect(() => {
    if (runningSteps === 0) return
    const interval = setInterval(() => {
      const newElapsed: Record<number, number> = {}
      toolSteps.forEach((step, idx) => {
        if (step.status === 'running' && startTimesRef.current[idx]) {
          newElapsed[idx] = Math.floor((Date.now() - startTimesRef.current[idx]) / 1000)
        }
      })
      if (Object.keys(newElapsed).length > 0) {
        setElapsedSeconds((prev) => ({ ...prev, ...newElapsed }))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [toolSteps, runningSteps])

  const minimizeText = (value: unknown, max = 180) => {
    if (value === null || value === undefined) return ''
    const text = String(value).replace(/\s+/g, ' ').trim()
    if (text.length <= max) return text
    return `${text.slice(0, max)}...`
  }

  const humanizeToolName = (name: string) => {
    const lower = (name || '').toLowerCase()
    if (lower.includes('duckduckgo') || lower.includes('search')) return 'Busca na web'
    if (lower.includes('reminder')) return 'Lembretes'
    if (lower.includes('interface')) return 'Interface'
    return name || 'Ferramenta'
  }

  const humanizeActivity = (activity: string) => {
    const lower = activity.toLowerCase()
    if (lower.includes('running capability')) {
      const raw = activity.replace(/running capability\s*:/i, '').trim()
      const match = raw.match(/^([a-zA-Z0-9_\-.]+)/)
      const toolName = match?.[1] || raw
      return humanizeToolName(toolName)
    }
    
    // Novas traduções e mapeamentos para transparência
    if (lower.includes('discovery:')) {
      return activity.replace(/discovery:/i, 'Descoberta:')
        .replace('analyzing request and seeking skills', 'Analisando pedido e buscando habilidades')
        .replace('skills found', 'Habilidades encontradas')
        .replace('no specialized skills needed', 'Nenhuma habilidade específica necessária')
        .replace('memory context loaded', 'Contexto de memória carregado')
    }
    if (lower.includes('assembler:') || lower.includes('orchestrating')) {
      return activity.replace(/assembler:/i, 'Montador:')
        .replace('orchestrating the best response', 'Orquestrando a melhor resposta')
    }
    if (lower.includes('manager:')) {
      return activity.replace(/manager:/i, 'Gerente:')
        .replace('delegating to specialist', 'Delegando para especialista')
        .replace('calling tool', 'Chamando ferramenta')
        .replace('finalizing response', 'Finalizando resposta')
    }
    if (lower.includes('specialist:')) {
      return activity.replace(/specialist:/i, 'Especialista:')
        .replace('executing specific task', 'Executando tarefa específica')
    }

    if (lower.includes('router decision')) return 'Decidindo abordagem'
    if (lower.includes('router')) return 'Analisando pedido'
    if (lower.includes('orchestrator')) return 'Planejando'
    if (lower.includes('agent')) return 'Gerando resposta'
    if (lower.includes('specialist')) return 'Gerando resposta'
    return activity
  }

  const latestActivityText =
    filteredActivities.length > 0
      ? humanizeActivity(filteredActivities[filteredActivities.length - 1])
      : 'Gerando resposta...'

  const liveStageText = (() => {
    if (runningSteps > 0) {
      const current = toolSteps.find((s) => s.status === 'running')
      const name = current?.name ? humanizeToolName(String(current.name)) : 'ação'
      return `Executando ${name.toLowerCase()}...`
    }
    if (isLoading) return 'Gerando resposta...'
    if (errorSteps > 0) return `${toolSteps.length} etapas (${errorSteps} erro)`
    if (toolSteps.length > 0) return `${completedSteps} etapas concluídas`
    return latestActivityText
  })()

  // Close trace when loading finishes (first token arrives)
  useEffect(() => {
    if (!isLoading && hasStageData) {
      const timer = setTimeout(() => {
        setShowTrace(false)
        setOpenToolIndex(null)
      }, 800)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isLoading, hasStageData])

  // Don't auto-show if we're in the "Gerando resposta" phase
  useEffect(() => {
    if (isGeneratingResponse) {
      return
    }

    if (isLoading) {
      setShowTrace(true)
      setShowToolDetails(true)
      return
    }

    if (runningSteps > 0) {
      setShowTrace(true)
      setShowToolDetails(true)
      return
    }
  }, [isLoading, runningSteps, isGeneratingResponse])

  if (isSystemModelChange) {
    const modelName =
      message.content.split('**')[1] ||
      message.content.replace('Brain changed to:', '').replace('⏳', '').replace('✅', '').trim()

    return (
      <div className="w-full flex justify-center px-4 my-4 animate-in fade-in zoom-in-95 duration-500">
        <div
          className={`max-w-full px-5 py-2.5 rounded-xl border backdrop-blur-md flex items-center gap-3 transition-all duration-700 min-w-0 ${isDone ? 'bg-white/5 border-white/5 shadow-sm' : 'bg-accent/10 border-accent/20 shadow-lg shadow-accent/5'}`}
        >
          <div className="flex-shrink-0">
            {isDone ? (
              <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20 animate-in zoom-in duration-300">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-green-400"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-accent animate-spin-slow"
                >
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0 overflow-hidden">
            <span
              className={`text-[10px] font-black uppercase tracking-[0.15em] ${isDone ? 'text-green-400/80' : 'text-accent/80'}`}
            >
              {isDone ? 'Cérebro Ativo' : 'Sincronizando'}
            </span>
            <span className="text-sm font-bold text-text break-all truncate sm:whitespace-normal">
              {modelName}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex items-start gap-3 sm:gap-4 max-w-full group animate-slide-in-up ${message.role === 'assistant' ? 'self-start w-full' : 'self-end flex-row-reverse ml-12'}`}
    >
      <div
        className={`flex-shrink-0 mt-1 ${message.role === 'assistant' ? 'block' : 'hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity'}`}
      >
        {message.role === 'assistant' ? (
          <div className="relative">
            <div className="absolute inset-0 bg-accent/10 blur-md rounded-full"></div>
            <img
              src={icon}
              alt="MomAI"
              className="relative z-10 w-8 h-8 rounded-lg object-cover border border-border/20 bg-card"
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent/5 flex items-center justify-center text-[10px] font-bold text-text-muted border border-border/20">
            EU
          </div>
        )}
      </div>

      <div
        className={`relative break-words overflow-hidden min-w-0 max-w-full transition-all duration-300 ${
          message.role === 'assistant'
            ? 'flex-1 pt-0.5 text-text text-[15px] sm:text-[16px] leading-relaxed message'
            : 'bg-accent/5 border border-border/30 p-3 px-4 rounded-xl rounded-tr-none text-text text-[14px] sm:text-[15px] message'
        }`}
      >
        {message.role === 'assistant' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] opacity-50">
              MomAI
            </span>

            <div className="flex items-center gap-1.5">
              {hasStageData && (
                <button
                  onClick={() => setShowTrace(!showTrace)}
                  className="text-[10px] text-text-muted hover:text-accent transition-colors"
                  title="Ver etapas da resposta"
                >
                  {isGeneratingResponse ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 animate-pulse">Gerando resposta...</span>
                    </div>
                  ) : shouldShowTrace ? (
                    'Ocultar etapas'
                  ) : isLoading ? (
                    liveStageText
                  ) : (
                    `Ver etapas da resposta (${totalStagesCount})`
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-0 transition-all duration-300 overflow-hidden">
          {message.role === 'assistant' && (
            <div 
              className={`transition-all duration-300 ease-out origin-top border-l-2 border-zinc-200 dark:border-white/10 ml-1.5 ${shouldShowTrace && (hasStageData || isLoading) ? 'max-h-[800px] opacity-100 mb-6 mt-3' : 'max-h-0 opacity-0 pointer-events-none'}`}
            >
              <div className="flex flex-col gap-0.5">
                {displayActivities.map((activity, idx) => {
                  const normalizedActivity = humanizeActivity(activity)
                  const parts = normalizedActivity.split(':')
                  const label = parts.length > 1 ? parts[0] : null
                  const value = parts.length > 1 ? parts.slice(1).join(':') : normalizedActivity

                  return (
                    <div key={`act-${idx}`} className="flex items-center gap-3 px-4 py-1 hover:bg-zinc-500/5 transition-colors group/row">
                      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20" />
                      
                      <div className="flex items-baseline gap-2 min-w-0">
                        {label && (
                          <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest shrink-0">
                            {label}
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate">
                          {value}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {toolSteps.map((step, idx) => {
                  const toolName = String(step.name || 'tool')
                  const isExpanded = openToolIndex === idx || (isLoading && step.status === 'running')
                  const isRunning = step.status === 'running'

                  return (
                    <div key={`tool-${idx}`} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => setOpenToolIndex(openToolIndex === idx ? null : idx)}
                        className={`flex items-center gap-3 px-4 py-1.5 hover:bg-zinc-500/5 transition-colors text-left group/tool ${isExpanded ? 'bg-zinc-500/5' : ''}`}
                      >
                        <div className="flex-shrink-0 w-1.5 h-1.5 flex items-center justify-center">
                          {isRunning ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20" />
                          )}
                        </div>

                        <div className="flex-1 flex items-baseline justify-between gap-4 min-w-0">
                          <span className={`text-[11px] font-bold tracking-tight ${isRunning ? 'text-blue-500 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-200'}`}>
                            {humanizeToolName(toolName)}
                          </span>
                          
                          <div className="flex items-center gap-2">
                            {isRunning ? (
                              <span className="text-[9px] text-blue-500/60 dark:text-blue-400/60 font-mono italic">
                                {elapsedSeconds[idx] || 0}s
                              </span>
                            ) : (
                              <svg className={`w-2.5 h-2.5 text-zinc-300 dark:text-white/10 transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                <polyline points="9 6 15 12 9 18" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="flex flex-col gap-3 px-8 py-3 animate-in fade-in slide-in-from-left-1 duration-200">
                          {step.query && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400/40">Input</span>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/5 pl-3 break-words">
                                {step.query}
                              </div>
                            </div>
                          )}
                          {step.result && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400/40">Output</span>
                              <div className="text-[11px] text-zinc-400/70 dark:text-zinc-500 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/5 pl-3 break-words">
                                {minimizeText(step.result, 300)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {displayContent && (
            <div className="transition-opacity duration-500 opacity-100">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => (
                    <thead className="border-b border-border/20" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th
                      className="px-3 py-2 text-left text-[10px] font-black text-accent/70 uppercase tracking-widest"
                      {...props}
                    />
                  ),
                  td: ({ node, ...props }) => (
                    <td
                      className="px-3 py-2 text-sm text-text-muted border-b border-border/10"
                      {...props}
                    />
                  ),
                  tr: ({ node, ...props }) => (
                    <tr className="hover:bg-text/5 transition-colors" {...props} />
                  )
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {isSpeaking && onStopVoice && !hideStopButton && (
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={handleStopVoiceClick}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all animate-pulse"
                title="Parar voz"
                aria-label="Parar voz"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
                <span className="text-[10px] font-semibold">Parar</span>
              </button>
            </div>
          )}

          {message.role === 'assistant' && message.graphData?.view === 'chat' && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.graphData.options?.map((option) => {
                const label = optionsMap[option] || option
                return (
                  <button
                    key={option}
                    onClick={() => onGraphOption(option)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-border/20 bg-accent/5 text-text-muted hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-all"
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {message.role === 'assistant' &&
            message.graphData &&
            message.graphData.view !== 'chat' && (
              <button
                onClick={() => onReopenGraph(message.graphData)}
                className="flex items-center gap-3 w-full p-3 bg-accent/5 border border-border/20 rounded-lg hover:bg-accent/10 hover:border-accent/30 transition-all group text-left cursor-pointer mt-1"
              >
                <div className="w-8 h-8 rounded bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform flex-shrink-0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                    <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                  </svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
                    Interface Gerada
                  </span>
                  <span className="text-xs text-text-muted truncate">
                    Clique para visualizar o relatório dinâmico
                  </span>
                </div>
              </button>
            )}
        </div>
      </div>
    </div>
  )
})

export default MessageItem
