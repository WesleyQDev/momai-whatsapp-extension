import { RefObject, JSX } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message } from '../services/api'
import { StatusData } from '../services/api'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  text: string
  onSendMessage: (text?: string) => void
  onClearHistory?: () => void
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
  onClearHistory,
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
      <div className="flex items-center justify-end px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onClearHistory}
          disabled={!onClearHistory || isLoading || messages.length === 0}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border/20 bg-card/40 text-text-muted hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Apagar conversas"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>
      </div>

      <MessageList
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
        onReopenGraph={onReopenGraph}
        onGraphOption={onGraphOption}
        onSendMessage={onSendMessage}
        onStopVoice={stopCurrentVoice}
        onStopGeneration={stopCurrentGeneration}
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
