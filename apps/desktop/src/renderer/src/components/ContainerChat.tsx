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
  onGraphOption: (option: string) => void
  statusInfo: StatusData | null
  stopCurrentGeneration?: () => void
  stopCurrentVoice?: () => void
  speakingIndex?: number | null
}

export default function ContainerChat({
  messages,
  isLoading,
  text,
  onSendMessage,
  messagesEndRef,
  isModeChanging = false,
  onReopenGraph,
  onGraphOption,
  statusInfo,
  stopCurrentGeneration,
  stopCurrentVoice,
  speakingIndex
}: ContainerChatProps): JSX.Element {
  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
        onReopenGraph={onReopenGraph}
        onGraphOption={onGraphOption}
        onSendMessage={onSendMessage}
        onStopVoice={stopCurrentVoice}
        speakingIndex={speakingIndex}
        statusInfo={statusInfo}
      />

      <ChatInput
        text={text}
        onSend={onSendMessage}
        isLoading={isLoading}
        isModeChanging={isModeChanging}
        statusInfo={statusInfo}
        onStopGeneration={stopCurrentGeneration}
      />
    </div>
  )
}
