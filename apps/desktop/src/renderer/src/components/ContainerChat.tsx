import { RefObject, JSX } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message } from '../services/api'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  text: string
  setText: (text: string) => void
  onSendMessage: () => void
  messagesEndRef: RefObject<HTMLDivElement | null>
  currentMode: string
  onModeChange: (mode: string) => void
  isModeChanging?: boolean
  onViewDetails: (content: string) => void
}

export default function ContainerChat({
  messages,
  isLoading,
  text,
  setText,
  onSendMessage,
  messagesEndRef,
  currentMode,
  onModeChange,
  isModeChanging = false,
  onViewDetails
}: ContainerChatProps): JSX.Element {
  return (
    <div className="bg-[#0a0f1e] bg-gradient-to-b from-indigo-500/5 to-transparent w-full h-full flex flex-col overflow-hidden shadow-2xl border-r border-border">
      <MessageList 
        messages={messages} 
        isLoading={isLoading} 
        messagesEndRef={messagesEndRef}
        isModeChanging={isModeChanging}
        onViewDetails={onViewDetails}
      />
      <ChatInput
        text={text}
        setText={setText}
        onSend={onSendMessage}
        isLoading={isLoading}
        currentMode={currentMode}
        onModeChange={onModeChange}
        isModeChanging={isModeChanging}
      />
    </div>
  )
}
