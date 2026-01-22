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
  isModeChanging = false
}: ContainerChatProps): JSX.Element {
  return (
    <div className="chat-menu container-box">
      <MessageList 
        messages={messages} 
        isLoading={isLoading} 
        messagesEndRef={messagesEndRef}
        isModeChanging={isModeChanging}
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
