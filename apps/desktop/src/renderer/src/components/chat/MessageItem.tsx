import { JSX, memo, useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { ExtrasRenderer } from './ExtrasRenderer'
import MessageContextMenu from './MessageContextMenu'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  isSpeaking?: boolean
  onStopVoice?: () => void
  onStopGeneration?: () => void
  onSpeak?: () => void
  onDelete?: () => void
  onRetry?: () => void
}

const MessageItem = memo(function MessageItem({
  message,
  isLoading = false,
  onReopenGraph,
  onGraphOption,
  isSpeaking = false,
  onStopVoice,
  onStopGeneration,
  onSpeak,
  onDelete,
  onRetry
}: MessageItemProps): JSX.Element {
  const [showTrace, setShowTrace] = useState(true)
  const [showToolDetails, setShowToolDetails] = useState(true)
  const [openToolIndex, setOpenToolIndex] = useState<number | null>(null)
  const [hideStopButton, setHideStopButton] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<Record<number, number>>({})
  const [openSources, setOpenSources] = useState(false)
  const [revealedSources, setRevealedSources] = useState<number>(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const startTimesRef = useRef<Record<number, number>>({})

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.y })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
  }

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

  // Check if tools have finished based on activities
  const isFinalizing = displayActivities.some(a => a.toLowerCase().includes('finalizando resposta'))
  const hasActualContent = message.content !== '...' && message.content.length > 0 && !isToolTrace
  const toolsFinished = isFinalizing || hasActualContent
  
  // Efeito para gerenciar a abertura/fechamento automático das fontes
  useEffect(() => {
    if (message.sources && message.sources.length > 0) {
      // 1. Abrir fontes se elas acabaram de chegar e ainda não estamos finalizando a resposta
      if (isLoading && !isFinalizing) {
        setOpenSources(true)
        if (message.sources.length <= revealedSources) {
          setRevealedSources(0)
        }
      } 
      // 2. Minimizar fontes se a resposta começou a ser finalizada ou o carregamento parou
      else if (isFinalizing || !isLoading) {
        setOpenSources(false)
      }
    }
  }, [message.sources?.length, isLoading, isFinalizing])

  useEffect(() => {
    if (isLoading && message.sources && message.sources.length > 0) {
      setRevealedSources(message.sources.length)
    }
  }, [message.sources, isLoading])

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

  // Update elapsed seconds every second (only works if toolSteps were populated, which they're not currently)
  useEffect(() => {
    if (toolSteps.length === 0) return
    const hasRunningStep = toolSteps.some((s) => s.status === 'running')
    if (!hasRunningStep) return
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
  }, [toolSteps])

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
    if (lower.includes('especialista: executando')) {
      return activity.replace(/especialista: executando/i, '').trim()
    }
    if (lower.includes('manager: delegando')) {
      return activity.replace(/manager: delegando para especialista/i, '').replace(/[()]/g, '').trim()
    }
    if (lower.includes('manager: chamando ferramenta')) {
      return activity.replace(/manager: chamando ferramenta/i, '').trim()
    }
    if (lower.includes('manager: finalizando')) {
      return activity.replace(/manager: finalizando resposta/i, '').trim()
    }
    if (lower.includes('discovery:')) {
      return activity.replace(/discovery:/i, '').trim()
    }
    if (lower.includes('usando skill:')) {
      return activity.replace(/usando skill:/i, '').trim()
    }
    if (lower.includes('usando ferramenta:')) {
      return activity.replace(/usando ferramenta:/i, '').trim()
    }
    if (lower.includes('buscando')) {
      return activity
    }
    return ''
  }

  const displayContentStr = String(displayContent || '')
  const ACTION_MARKER = '__MOMAI_ACTIONS__'
  const hasMarker = displayContentStr.includes(ACTION_MARKER)
  
  const textParts = hasMarker ? displayContentStr.split(ACTION_MARKER) : [displayContentStr]
  const introText = textParts[0]?.trim()
  const finalResponseText = hasMarker ? textParts[1]?.trim() : ''

  return (
    <div 
      onContextMenu={handleContextMenu}
      className={`flex items-start gap-3 sm:gap-4 max-w-full group ${message.role === 'assistant' ? 'self-start w-full' : 'self-end flex-row-reverse ml-12'}`}
    >
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isUser={message.role === 'user'}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onSpeak={onSpeak || (() => {})}
          onDelete={onDelete || (() => {})}
          onRetry={onRetry}
        />
      )}
      <div className={`flex-shrink-0 mt-1 ${message.role === 'assistant' ? 'block' : 'hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity'}`}>
        {message.role === 'assistant' ? (
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-[-2px] rounded-xl bg-gradient-to-tr from-accent/40 via-purple-500/20 to-accent/40 animate-spin-slow opacity-40 blur-[4px]"></div>
            )}
            <div className={`relative z-10 w-8 h-8 rounded-lg border border-border/20 bg-card overflow-hidden ${isLoading ? 'animate-ai-loading ring-1 ring-accent/20' : ''}`}>
              <img src={icon} alt="MomAI" className="w-full h-full object-cover" />
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent/5 flex items-center justify-center text-[10px] font-bold text-text-muted border border-border/20">EU</div>
        )}
      </div>

      <div className={`relative break-words overflow-hidden min-w-0 max-w-full transition-all duration-300 ${message.role === 'assistant' ? 'flex-1 pt-0.5 text-text text-[15px] sm:text-[16px] leading-relaxed message' : 'bg-accent/5 border border-border/30 p-3 px-4 rounded-xl rounded-tr-none text-text text-[14px] sm:text-[15px] message'}`}>
        
        <div className="flex flex-col gap-0 transition-all duration-300 overflow-hidden">
          {/* 1. Aviso Inicial */}
          {introText && (
            <div className={`transition-all duration-500 ${(hasStageData || isLoading) ? 'mb-2' : ''} animate-in fade-in`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{introText}</ReactMarkdown>
            </div>
          )}

          {/* Área de Ações - Skills, Tools e Sources integrados */}
          {message.role === 'assistant' && (hasStageData || isLoading) && (
            <div className="flex flex-col gap-1 mb-2">

              {/* Skills, Tools e Sources - todos inline juntos */}
              {(displayActivities.filter(a => {
                const lower = a.toLowerCase()
                return lower.includes('especialista: executando') || 
                       lower.includes('manager: chamando ferramenta') ||
                       lower.includes('memória:')
              }).length > 0 || (message.sources && message.sources.length > 0)) && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center animate-in slide-in-from-left-2 fade-in duration-300">
                  
                  {/* Skills/Tools inline */}
                  {displayActivities.filter(a => {
                    const lower = a.toLowerCase()
                    return lower.includes('especialista: executando') || 
                           lower.includes('manager: chamando ferramenta') ||
                           lower.includes('memória:')
                  }).map((activity, idx) => {
                    const lower = activity.toLowerCase()
                    const isSkill = lower.includes('especialista: executando')
                    const isMemory = lower.includes('memória:')
                    
                    let name = ''
                    let prefix = 'Tool: '
                    
                    if (isSkill) {
                      name = activity.replace(/especialista: executando/i, '').replace(/\.\.\.$/, '').trim()
                      prefix = 'Skill: '
                    } else if (isMemory) {
                      name = activity.replace(/memória:/i, '').replace(/\.\.\.$/, '').trim()
                      prefix = 'Memória: '
                    } else {
                      name = activity.replace(/manager: chamando ferramenta/i, '').replace(/\.\.\.$/, '').trim()
                    }
                    
                    return (
                      <span 
                        key={`activity-${idx}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500"
                      >
                        <DocumentTextIcon className={`w-3 h-3 ${isMemory ? 'text-purple-500' : 'text-blue-500'}`} />
                        {prefix}{name}
                      </span>
                    )
                  })}

                  {/* Fontes inline */}
                  {message.sources && message.sources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenSources(!openSources)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span>Fontes ({message.sources.length})</span>
                      <svg 
                        width="8" 
                        height="8" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        className={`text-zinc-400 transition-transform duration-200 ${openSources ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Sources com ícone de lupa - uma por uma */}
              {message.sources && message.sources.length > 0 && openSources && (
                <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
                  {message.sources.map((source, idx) => {
                    const isRevealed = idx < revealedSources
                    const isNote = source.url.startsWith('momai://note/')
                    const urlObj = (() => { 
                      if (isNote) return null
                      try { return new URL(source.url) } catch { return null } 
                    })()
                    const domain = isNote ? 'Memória Local' : (urlObj ? urlObj.hostname.replace('www.', '') : source.url)
                    const hasValidTitle = source.title && source.title.length > 3 && source.title !== domain
                    const displayTitle = hasValidTitle ? source.title : domain
                    
                    if (!isRevealed) {
                      const isNextToLoad = idx === revealedSources
                      if (isLoading && !isNextToLoad) return null
                      
                      return (
                        <div key={`placeholder-${idx}`} className="flex items-start gap-2 animate-pulse">
                          <div className={`w-4 h-4 rounded-full ${isNote ? 'bg-purple-200 dark:bg-purple-900/30' : 'bg-zinc-200 dark:bg-zinc-800'} flex-shrink-0 mt-0.5`} />
                          <div className="flex flex-col min-w-0 gap-1.5 flex-1">
                            <div className="h-3 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                            <div className="h-2 w-2/3 bg-zinc-100 dark:bg-zinc-900 rounded-full" />
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <a
                        key={`${source.url}-${idx}`}
                        href={isNote ? '#' : source.url}
                        target={isNote ? '_self' : "_blank"}
                        rel="noopener noreferrer"
                        className="group flex items-start gap-3 p-2 -ml-2 rounded-xl hover:bg-accent/5 transition-all duration-300 animate-in fade-in slide-in-from-left-4 zoom-in-95"
                        style={{ animationDelay: `${idx * 0.08}s`, animationFillMode: 'both' }}
                        onClick={(e) => {
                          if (isNote) e.preventDefault()
                        }}
                      >
                        <div className={`w-8 h-8 rounded-lg ${isNote ? 'bg-purple-500/10' : 'bg-zinc-100 dark:bg-white/5'} flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:bg-accent/10 transition-all duration-300`}>
                          {isNote ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-500 group-hover:text-accent transition-colors">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-zinc-400 group-hover:text-accent transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="11" cy="11" r="8" />
                              <path d="m21 21-4.35-4.35" />
                            </svg>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[14px] font-semibold text-text group-hover:text-accent transition-colors truncate">
                            {displayTitle}
                          </span>
                          {source.snippet && source.snippet.trim() && (
                            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                              {source.snippet}
                            </span>
                          )}
                        </div>
                      </a>
                    )
                  })}
                </div>
              )}

              {/* Snippets and Cards from Skills - use ExtrasRenderer for all extras */}
              {(message.snippets?.length || message.cards?.length) && (
                <div className="mt-2">
                  <ExtrasRenderer 
                    snippets={message.snippets} 
                    cards={message.cards}
                    isLoading={isLoading}
                  />
                </div>
              )}

              {/* Status de Execução - minimalista */}
              {isLoading && displayActivities.length > 0 && !toolsFinished && (() => {
                const searchActivity = displayActivities.find(a => a.toLowerCase().includes('buscando'))
                const toolActivity = displayActivities.find(a => a.toLowerCase().includes('chamando'))
                const label = searchActivity ? 'Buscando...' : (toolActivity ? toolActivity.replace(/manager: chamando ferramenta/i, '').trim() + '...' : 'Executando...')
                return (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400 animate-pulse">{label}</span>
                  </div>
                )
              })()}

              {/* Cards de Ferramentas - mais compactos */}
              {toolSteps.length > 0 && (
                <div className="flex flex-col gap-1 mt-0.5">
                  {toolSteps.map((step, idx) => {
                    const toolName = String(step.name || 'tool')
                    const isRunning = step.status === 'running'
                    const isExpanded = openToolIndex === idx || isRunning
                    return (
                      <div key={`tool-${idx}`} className={`flex flex-col rounded-lg border transition-all duration-500 ${isRunning ? 'border-blue-500/30 bg-blue-500/[0.03]' : 'border-zinc-200 dark:border-white/5 bg-zinc-500/[0.01]'}`}>
                        <button type="button" onClick={() => setOpenToolIndex(openToolIndex === idx ? null : idx)} className="flex items-center justify-between px-2.5 py-2 text-left group">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all duration-300 ${isRunning ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-400'}`}>
                              {isRunning ? (
                                <svg className="w-2 h-2 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                                </svg>
                              ) : (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${isRunning ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}>{humanizeToolName(toolName)}</span>
                              {isRunning && <span className="text-[7px] text-blue-500/60 font-bold animate-pulse">{elapsedSeconds[idx] || 0}s</span>}
                            </div>
                          </div>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`text-zinc-300 dark:text-white/10 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <polyline points="9 6 15 12 9 18"></polyline>
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="px-2.5 pb-2 pt-0.5 flex flex-col gap-2 animate-in fade-in duration-300">
                            {step.query && (
                              <div className="flex flex-col gap-0.5 ml-7">
                                <span className="text-[6px] font-black uppercase tracking-[0.2em] text-zinc-400/40">Input</span>
                                <div className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/10 pl-2 break-words">{step.query}</div>
                              </div>
                            )}
                            {step.result && (
                              <div className="flex flex-col gap-0.5 ml-7">
                                <span className="text-[6px] font-black uppercase tracking-[0.2em] text-zinc-400/40">Output</span>
                                <div className="text-[9px] text-zinc-400/70 dark:text-zinc-500 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/10 pl-2 break-words">{minimizeText(step.result, 300)}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Resposta Final */}
          {finalResponseText && (
            <div className="transition-all duration-500 animate-in fade-in">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                table: ({ node, ...props }) => <div className="overflow-x-auto my-4 scrollbar-thin"><table className="min-w-full border-collapse border border-border/20 rounded-lg overflow-hidden" {...props} /></div>,
                thead: ({ node, ...props }) => <thead className="bg-white/5" {...props} />,
                th: ({ node, ...props }) => <th className="px-4 py-2.5 text-left text-[10px] font-black text-accent/90 uppercase tracking-widest border border-border/10" {...props} />,
                td: ({ node, ...props }) => <td className="px-4 py-2 text-sm text-text-muted border border-border/10" {...props} />,
                tr: ({ node, ...props }) => <tr className="hover:bg-white/[0.02] transition-colors" {...props} />
              }}>
                {finalResponseText}
              </ReactMarkdown>
            </div>
          )}

          {/* 4. Rodapé de Opções */}
          {message.role === 'assistant' && (
            <div className="flex flex-col gap-2 mt-2">
              {isSpeaking && onStopVoice && !hideStopButton && (
                <div className="flex justify-end">
                  <button type="button" onClick={handleStopVoiceClick} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all animate-pulse">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                    <span className="text-[10px] font-semibold">Parar</span>
                  </button>
                </div>
              )}
              {message.graphData?.view === 'chat' && (
                <div className="flex flex-wrap gap-2">
                  {message.graphData.options?.map((option) => {
                    const label = optionsMap[option] || option
                    return <button key={option} onClick={() => onGraphOption(option)} className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-border/20 bg-accent/5 text-text-muted hover:bg-accent/10 hover:border-accent/30 transition-all">{label}</button>
                  })}
                </div>
              )}
              {message.graphData && message.graphData.view !== 'chat' && (
                <button onClick={() => onReopenGraph(message.graphData)} className="flex items-center gap-3 w-full p-3 bg-accent/5 border border-border/20 rounded-lg hover:bg-accent/10 hover:border-accent/30 transition-all group text-left cursor-pointer">
                  <div className="w-8 h-8 rounded bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                      <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                    </svg>
                  </div>
                  <div className="flex flex-col min-0">
                    <span className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">Interface Gerada</span>
                    <span className="text-xs text-text-muted truncate">Clique para visualizar o relatório dinâmico</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MessageItem
