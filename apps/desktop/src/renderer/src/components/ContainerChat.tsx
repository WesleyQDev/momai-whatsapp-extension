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
    <div className="bg-[#0c1222] w-[25rem] my-8 mx-20 rounded-[15px] border border-[#252931] flex flex-col overflow-hidden">
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
