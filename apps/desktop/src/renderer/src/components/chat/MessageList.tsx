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
    <main className="messages">
      {messages.length === 0 && <div className="empty">Olá senhor, comece a digitar</div>}
      {messages.map((msg, i) => (
        <MessageItem
          key={i}
          message={msg}
          isLoading={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
        />
      ))}
      
      {isModeChanging && (
        <div className="system-message">
          <span className="typing-dot" style={{width: 6, height: 6, backgroundColor: 'var(--accent)'}}></span>
          <span>Alterando modelo de IA...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </main>
  )
}
