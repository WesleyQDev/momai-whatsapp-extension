import { RefObject, JSX, memo } from 'react'
import MessageItem from './MessageItem'
import { Message } from '../../services/api'
import WelcomeTips from './WelcomeTips'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  messagesEndRef: RefObject<HTMLDivElement | null>
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  onSendMessage: (text: string) => void
}

const MessageList = memo(function MessageList({
  messages,
  isLoading,
  messagesEndRef,
  onReopenGraph,
  onGraphOption,
  onSendMessage
}: MessageListProps): JSX.Element {
  return (
    <main className="flex-1 flex flex-col gap-5 p-4 overflow-y-auto overflow-x-hidden relative">
      {messages.length === 0 && <WelcomeTips onSendMessage={onSendMessage} />}
      {messages.map((msg, i) => (
        <MessageItem
          key={i}
          message={msg}
          isLoading={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
          onReopenGraph={onReopenGraph}
          onGraphOption={onGraphOption}
        />
      ))}

      <div ref={messagesEndRef} />
    </main>
  )
})

export default MessageList
