import { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
}

export default function MessageItem({ message, isLoading = false }: MessageItemProps): JSX.Element {
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
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