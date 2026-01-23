import { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  onViewDetails: (content: string) => void
}

export default function MessageItem({ message, isLoading = false, onViewDetails }: MessageItemProps): JSX.Element {
  const TRUNCATE_LIMIT = 600
  const shouldTruncate = message.role === 'assistant' && message.content.length > TRUNCATE_LIMIT

  return (
    <div className={`flex items-end gap-2.5 max-w-[80%] ${message.role === 'assistant' ? 'self-start flex-row items-start' : 'self-end flex-row-reverse'}`}>
      {message.role === 'assistant' && (
        <img src={icon} alt="MomAI" className="w-8 h-8 rounded-full object-cover border border-border bg-surface shrink-0 mt-2.5" />
      )}
      
      <div className={`p-3 px-4 w-fit break-words ${
          message.role === 'assistant' 
            ? 'bg-transparent py-0 text-slate-200 text-base leading-relaxed' 
            : 'bg-[#1e2538] rounded-t-xl rounded-bl-xl text-slate-100'
        }`}>
        {message.role === 'assistant' ? (
          <>
            <div className={shouldTruncate ? "opacity-70 mb-2" : ""}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {shouldTruncate ? message.content.slice(0, 200) + '...' : message.content}
                </ReactMarkdown>
            </div>
            
            {shouldTruncate && (
                <button 
                    onClick={() => onViewDetails(message.content)}
                    className="flex items-center gap-3 w-full p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-accent/30 transition-all group text-left cursor-pointer"
                >
                    <div className="w-8 h-8 rounded bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-white group-hover:text-accent transition-colors">Conteúdo Estendido</span>
                        <span className="text-xs text-text-muted">Clique para visualizar a resposta completa</span>
                    </div>
                </button>
            )}

            {isLoading && (
              <div className="flex items-center gap-1 py-1 mt-1.5">
                <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[typing_1.4s_infinite_ease-in-out_both_-0.32s]"></span>
                <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[typing_1.4s_infinite_ease-in-out_both_-0.16s]"></span>
                <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[typing_1.4s_infinite_ease-in-out_both]"></span>
              </div>
            )}
          </>
        ) : (
          message.content
        )}
      </div>
    </div>
  )
}