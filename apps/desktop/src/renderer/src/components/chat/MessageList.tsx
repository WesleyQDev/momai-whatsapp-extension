import { RefObject, JSX, memo } from 'react'
import MessageItem from './MessageItem'
import { Message } from '../../services/api'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  currentStatus: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  onReopenGraph: (data: any) => void
}

const MessageList = memo(function MessageList({
  messages,
  isLoading,
  currentStatus,
  messagesEndRef,
  onReopenGraph
}: MessageListProps): JSX.Element {
  return (
    <main className="flex-1 flex flex-col gap-5 p-4 overflow-y-auto overflow-x-hidden">
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-fade-in opacity-40">
          <div className="w-16 h-16 rounded-3xl bg-accent/10 flex items-center justify-center mb-4 border border-accent/20">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
             </svg>
          </div>
          <h2 className="text-xl font-semibold text-text mb-2">Bem-vindo ao MomAI</h2>
          <p className="text-sm text-text-muted max-w-xs">
            Sua assistente virtual inteligente. Como posso ajudar você hoje?
          </p>
        </div>
      )}
      {messages.map((msg, i) => (
        <MessageItem
          key={i}
          message={msg}
          isLoading={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
          currentStatus={isLoading && i === messages.length - 1 ? currentStatus : null}
          onReopenGraph={onReopenGraph}
        />
      ))}
      
      <div ref={messagesEndRef} />
    </main>
  )
})

export default MessageList
