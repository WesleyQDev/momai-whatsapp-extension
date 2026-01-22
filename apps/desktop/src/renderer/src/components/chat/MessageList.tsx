import { RefObject, JSX } from 'react'
import MessageItem from './MessageItem'
import { Message } from '../../services/api'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  messagesEndRef: RefObject<HTMLDivElement | null>
  isModeChanging?: boolean
}

export default function MessageList({
  messages,
  isLoading,
  messagesEndRef,
  isModeChanging = false
}: MessageListProps): JSX.Element {
  return (
    <main className="flex-1 flex flex-col gap-4 p-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent">
      {messages.length === 0 && <div className="mx-auto text-center">Olá senhor, comece a digitar</div>}
      {messages.map((msg, i) => (
        <MessageItem
          key={i}
          message={msg}
          isLoading={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
        />
      ))}
      
      {isModeChanging && (
        <div className="self-center bg-accent/10 text-text-muted px-4 py-2 rounded-[20px] text-xs my-2.5 border border-border flex items-center gap-2 animate-[fadeIn_0.3s_ease]">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></span>
          <span>Alterando modelo de IA...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </main>
  )
}
