import { RefObject, JSX } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message } from '../services/api'
import { StatusData } from '../services/api'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  currentStatus: string | null
  text: string
  onSendMessage: (text?: string) => void
  messagesEndRef: RefObject<HTMLDivElement | null>
  currentMode: string
  onModeChange: (mode: string) => void
  isModeChanging?: boolean
  onReopenGraph: (data: any) => void
  statusInfo: StatusData | null
  onOpenSettings: (tab: 'general' | 'brain' | 'voice') => void
}

export default function ContainerChat({
  messages,
  isLoading,
  currentStatus,
  text,
  onSendMessage,
  messagesEndRef,
  currentMode,
  onModeChange,
  isModeChanging = false,
  onReopenGraph,
  statusInfo,
  onOpenSettings
}: ContainerChatProps): JSX.Element {
  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        currentStatus={currentStatus}
        messagesEndRef={messagesEndRef}
        onReopenGraph={onReopenGraph}
      />

      <ChatInput
        text={text}
        onSend={onSendMessage}
        isLoading={isLoading}
        currentMode={currentMode}
        onModeChange={onModeChange}
        isModeChanging={isModeChanging}
        statusInfo={statusInfo}
        onOpenSettings={onOpenSettings}
      />
    </div>
  )
}