import { JSX, memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  onReopenGraph: (data: any) => void
}

const MessageItem = memo(function MessageItem({
  message,
  isLoading = false,
  onReopenGraph
}: MessageItemProps): JSX.Element {
  const [showTrace, setShowTrace] = useState(false)

  const isSystemModelChange =
    message.role === 'assistant' && message.content.startsWith('Brain changed to:')
  const isDone = message.content.includes('✅')

  // Limpa o indicador de expectativa do conteúdo para não aparecer no texto
  const displayContent = message.content === '...' ? '' : message.content

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
        {' '}
        {message.role === 'assistant' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] opacity-50">
              MomAI
            </span>

            {/* TRACE TOGGLE BUTTON (INLINE) */}
            {!isLoading && message.activities && message.activities.length > 0 && (
              <button
                onClick={() => setShowTrace(!showTrace)}
                className={`flex items-center justify-center w-4 h-4 rounded transition-all cursor-pointer ${showTrace ? 'text-accent bg-accent/10' : 'text-text-muted/40 hover:text-accent hover:bg-accent/10'}`}
                title="View System Trace"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className={`transition-transform duration-300 ${showTrace ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {message.role === 'assistant' && (
            <>
              {/* ACTIVE STATUS (Only while loading) */}
              {isLoading && (
                <div className="flex items-center gap-2 px-1 py-0.5 animate-in fade-in duration-700 mb-1">
                  <div className="w-2.5 h-2.5 flex items-center justify-center relative">
                    <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping"></span>
                    <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                  </div>
                  <span className="text-[10px] font-bold text-accent/80 uppercase tracking-[0.15em] animate-pulse">
                    {message.activities && message.activities.length > 0
                      ? message.activities[message.activities.length - 1]
                          .split(':')[0]
                          .replace('Running capability', 'Executing')
                      : 'Thinking...'}
                  </span>
                </div>
              )}

              {/* TRACE CONTAINER (Visible via State) */}
              {!isLoading && showTrace && message.activities && message.activities.length > 0 && (
                <div className="flex flex-col gap-1 mt-1 mb-2 animate-in slide-in-from-top-2 duration-200">
                  {message.activities.map((activity, idx) => {
                    let iconInfo = <div className="w-1 h-1 rounded-full bg-border" />
                    let content = activity
                    let highlightColor = 'text-text-muted'

                    if (activity.toLowerCase().includes('router')) {
                      highlightColor = 'text-purple-400'
                      iconInfo = (
                        <svg
                          className="w-3 h-3 text-purple-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <polyline points="16 3 21 3 21 8"></polyline>
                          <line x1="4" y1="20" x2="21" y2="3"></line>
                          <polyline points="21 16 21 21 16 21"></polyline>
                          <line x1="15" y1="15" x2="21" y2="21"></line>
                          <line x1="4" y1="4" x2="9" y2="9"></line>
                        </svg>
                      )
                    } else if (
                      activity.toLowerCase().includes('running capability') ||
                      activity.toLowerCase().includes('executing')
                    ) {
                      highlightColor = 'text-cyan-400'
                      content = content.replace('Running capability:', '').trim()
                      iconInfo = (
                        <svg
                          className="w-3 h-3 text-cyan-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                        </svg>
                      )
                    } else if (activity.toLowerCase().includes('orchestrator')) {
                      highlightColor = 'text-blue-400'
                      iconInfo = (
                        <svg
                          className="w-3 h-3 text-blue-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                          <rect x="9" y="9" width="6" height="6"></rect>
                          <line x1="9" y1="1" x2="9" y2="4"></line>
                          <line x1="15" y1="1" x2="15" y2="4"></line>
                          <line x1="9" y1="20" x2="9" y2="23"></line>
                          <line x1="15" y1="20" x2="15" y2="23"></line>
                          <line x1="20" y1="9" x2="23" y2="9"></line>
                          <line x1="20" y1="14" x2="23" y2="14"></line>
                          <line x1="1" y1="9" x2="4" y2="9"></line>
                          <line x1="1" y1="14" x2="4" y2="14"></line>
                        </svg>
                      )
                    } else if (
                      activity.toLowerCase().includes('specialist') ||
                      activity.toLowerCase().includes('agent')
                    ) {
                      _activityType = 'agent'
                      highlightColor = 'text-emerald-400'
                      iconInfo = (
                        <svg
                          className="w-3 h-3 text-emerald-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <rect x="3" y="11" width="18" height="10" rx="2" />
                          <circle cx="12" cy="5" r="2" />
                          <path d="M12 7v4" />
                          <line x1="8" y1="16" x2="8.01" y2="16" />
                          <line x1="16" y1="16" x2="16.01" y2="16" />
                        </svg>
                      )
                    }

                    // Split content for highlighting (e.g. key: value)
                    const parts = content.split(':')
                    let label = parts.length > 1 ? parts[0] : null
                    const value = parts.length > 1 ? parts.slice(1).join(':') : content

                    // Rename generic terms for better UX
                    if (label && label.toUpperCase() === 'SPECIALIST') label = 'AGENT'

                    return (
                      <div key={idx} className="relative group/item py-1 first:pt-0">
                        <div className="flex items-start gap-2 opacity-60 group-hover/item:opacity-100 transition-opacity">
                          <div className="mt-0.5 opacity-80">{iconInfo}</div>
                          <span className="text-[11px] font-medium tracking-wide text-text-muted leading-relaxed font-mono">
                            {label && (
                              <span
                                className={`${highlightColor} font-bold opacity-80 uppercase text-[9px] mr-2 tracking-wider`}
                              >
                                {label}
                              </span>
                            )}
                            {value}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
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

          {message.role === 'assistant' && message.graphData && (
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
