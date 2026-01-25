import { JSX, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  currentStatus?: string | null
  onReopenGraph: (data: any) => void
}

const MessageItem = memo(function MessageItem({
  message,
  isLoading = false,
  currentStatus = null,
  onReopenGraph
}: MessageItemProps): JSX.Element {
  const isSystemModelChange =
    message.role === 'assistant' && message.content.startsWith('Cérebro alterado para:')
  const isDone = message.content.includes('✅')

  // Limpa o indicador de expectativa do conteúdo para não aparecer no texto
  const displayContent = message.content === '...' ? '' : message.content

  if (isSystemModelChange) {
    const modelName =
      message.content.split('**')[1] ||
      message.content
        .replace('Cérebro alterado para:', '')
        .replace('⏳', '')
        .replace('✅', '')
        .trim()

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
            <span className="text-sm font-bold text-white/90 break-all truncate sm:whitespace-normal">
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
              className="relative z-10 w-8 h-8 rounded-lg object-cover border border-white/10 bg-[#0a0f1e]"
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-text-muted border border-white/5">
            EU
          </div>
        )}
      </div>

      <div
        className={`relative break-words overflow-hidden min-w-0 max-w-full transition-all duration-300 ${
          message.role === 'assistant'
            ? 'flex-1 pt-0.5 text-slate-200 text-[15px] sm:text-[16px] leading-relaxed message'
            : 'bg-white/[0.03] border border-white/5 p-3 px-4 rounded-2xl rounded-tr-none text-slate-100 text-[14px] sm:text-[15px] message'
        }`}
      >
        {message.role === 'assistant' && (
          <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] mb-2 opacity-50">
            MomAI
          </div>
        )}
        <div className="flex flex-col gap-1.5">
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
                  thead: ({ node, ...props }) => <thead className="border-b border-white/10" {...props} />,
                  th: ({ node, ...props }) => (
                    <th className="px-3 py-2 text-left text-[10px] font-black text-accent/70 uppercase tracking-widest" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="px-3 py-2 text-sm text-text-muted border-b border-white/5" {...props} />
                  ),
                  tr: ({ node, ...props }) => <tr className="hover:bg-white/[0.01] transition-colors" {...props} />,
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {message.role === 'assistant' && message.graphData && (
            <button
              onClick={() => onReopenGraph(message.graphData)}
              className="flex items-center gap-3 w-full p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-accent/30 transition-all group text-left cursor-pointer mt-1"
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
                <span className="text-sm font-medium text-white group-hover:text-accent transition-colors truncate">
                  Interface Gerada
                </span>
                <span className="text-xs text-text-muted truncate">
                  Clique para visualizar o relatório dinâmico
                </span>
              </div>
            </button>
          )}

          {message.role === 'assistant' && isLoading && (
            <div className="flex items-center gap-2 py-1 mt-1.5">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-[typing_1.4s_infinite_ease-in-out_both_-0.32s]"></span>
                <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-[typing_1.4s_infinite_ease-in-out_both_-0.16s]"></span>
                <span className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-[typing_1.4s_infinite_ease-in-out_both]"></span>
              </div>
              {currentStatus && (
                <span className="text-[10px] font-bold text-accent/50 uppercase tracking-widest animate-pulse">
                  {currentStatus}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MessageItem
