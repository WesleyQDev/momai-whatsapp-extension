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
  isCallMode?: boolean
  voiceStatus?: 'idle' | 'listening' | 'processing'
  onToggleCallMode?: () => void
  callHistory?: { role: 'user' | 'assistant'; content: string }[]
}

const CallModeUI = ({
  onEndCall,
  history = [],
  status = 'idle'
}: {
  onEndCall: () => void
  history?: { role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
}) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent">
    {/* Visual Center Piece */}
    <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
      {/* Dynamic Glows */}
      <div className={`absolute inset-0 bg-accent/20 rounded-full blur-2xl transition-all duration-700 ${status !== 'idle' ? 'opacity-100 scale-150' : 'opacity-20 scale-100'}`} />
      <div className={`absolute inset-2 bg-accent/10 rounded-full blur-xl transition-all duration-1000 ${status === 'listening' ? 'opacity-100 scale-110' : 'opacity-0 scale-90'}`} />
      
      {/* Animated Rings */}
      {status === 'listening' && (
        <>
          <div className="absolute inset-[-4px] border-2 border-accent/30 rounded-full animate-[ping_2s_infinite]" />
          <div className="absolute inset-[-12px] border border-accent/10 rounded-full animate-[ping_3s_infinite]" />
        </>
      )}

      {/* Core Icon Container */}
      <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 z-10 backdrop-blur-md shadow-2xl ${
        status === 'processing' 
          ? 'bg-accent/30 border-2 border-accent animate-pulse shadow-accent/40' 
          : 'bg-accent/20 border-2 border-accent/40 shadow-accent/10'
      }`}>
        {status === 'processing' ? (
          <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
        ) : (
          <svg width="36" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
      </div>
    </div>

    {/* Status Message */}
    <div className="h-6 mb-8 text-center flex flex-col justify-center">
      <span className={`text-[11px] font-black uppercase tracking-[0.5em] transition-all duration-500 ${
        status === 'listening' ? 'text-accent animate-pulse' : 'text-text-muted/40'
      }`}>
        {status === 'listening' ? 'Escutando' : status === 'processing' ? 'Processando' : 'Aguardando'}
      </span>
    </div>

    {/* Main Content Area */}
    <div 
      className="w-full max-w-[500px] mb-8 overflow-hidden relative"
      style={{ 
        height: '140px',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)'
      }}
    >
      <div className="flex flex-col items-center justify-end min-h-full space-y-4 pb-2">
        {history.map((item) => {
          const isLast = item.id === history[history.length - 1].id
          const cleanContent = item.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()
          
          if (!cleanContent) return null

          return (
            <div
              key={item.id}
              className={`w-full transition-all duration-700 ease-out transform ${
                isLast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-20 -translate-y-4 scale-95 blur-[0.5px]'
              }`}
            >
              <p
                className={`text-center text-xl leading-snug px-6 break-words tracking-tight ${
                  item.role === 'user' 
                    ? 'text-white font-bold drop-shadow-md' 
                    : 'text-text-muted font-medium italic'
                }`}
              >
                {cleanContent}
              </p>
            </div>
          )
        })}
      </div>
    </div>

    {/* Footer Action */}
    <button
      type="button"
      onClick={onEndCall}
      className="group relative flex items-center gap-4 px-10 py-4 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-text hover:text-red-500 rounded-3xl transition-all duration-500 active:scale-95 shadow-2xl backdrop-blur-xl"
    >
      <div className="w-2.5 h-2.5 bg-red-500 rounded-full group-hover:animate-ping" />
      <span className="font-extrabold text-xs uppercase tracking-widest">Desconectar</span>
    </button>
  </div>
)

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
  speakingIndex,
  isCallMode = false,
  voiceStatus = 'idle',
  onToggleCallMode,
  callHistory = []
}: ContainerChatProps): JSX.Element {
  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      {!isCallMode && (
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
      )}

      {isCallMode ? (
        <CallModeUI
          onEndCall={onToggleCallMode || (() => {})}
          history={callHistory}
          status={voiceStatus}
        />
      ) : (
        <>
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
            isCallMode={isCallMode}
            onToggleCallMode={onToggleCallMode}
          />
        </>
      )}
    </div>
  )
}
