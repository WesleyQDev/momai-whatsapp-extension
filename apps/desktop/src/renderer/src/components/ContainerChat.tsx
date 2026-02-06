import { RefObject, JSX } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message } from '../services/api'
import { StatusData } from '../services/api'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  text: string
  onSendMessage: (text?: string) => void
  messagesEndRef: RefObject<HTMLDivElement | null>
  isModeChanging?: boolean
  onReopenGraph: (data: any) => void
  statusInfo: StatusData | null
}

export default function ContainerChat({
  messages,
  isLoading,
  text,
  onSendMessage,
  messagesEndRef,
  isModeChanging = false,
  onReopenGraph,
  statusInfo
}: ContainerChatProps): JSX.Element {
  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
        onReopenGraph={onReopenGraph}
      />

      <ChatInput
        text={text}
        onSend={onSendMessage}
        isLoading={isLoading}
        isModeChanging={isModeChanging}
        statusInfo={statusInfo}
      />
    </div>
  )
}
