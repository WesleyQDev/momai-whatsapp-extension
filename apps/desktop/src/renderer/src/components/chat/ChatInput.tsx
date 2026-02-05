import { useEffect, useRef, useState } from 'react'
import icon from '../../assets/icon.png'
import { StatusData } from '../../services/api'

interface ChatInputProps {
  text: string
  onSend: (text?: string) => void
  isLoading: boolean
  currentMode: string
  onModeChange: (mode: string) => void
  isModeChanging?: boolean
  statusInfo: StatusData | null
  onOpenSettings: (tab: 'general' | 'brain' | 'voice') => void
}

const MODES = [
  { id: 'local', name: 'Local', icon: icon, setupKey: 'local_installed' }
]

export default function ChatInput({
  text,
  onSend,
  isLoading,
  currentMode,
  onModeChange,
  isModeChanging = false,
  statusInfo,
  onOpenSettings
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localText, setLocalText] = useState(text)

  // Sync local text with external text (e.g. when text is cleared after sending)
  useEffect(() => {
    setLocalText(text)
  }, [text])

  useEffect(() => {
    // Focus on mount
    inputRef.current?.focus()

    const handleFocus = () => {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement

      const isSpecialKey = e.key.length > 1 && e.key !== 'Backspace'

      if (!isTyping && !isSpecialKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus()
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false

  const handleSend = () => {
    if (!localText.trim() || isLoading || isModeChanging || !isBrainReady || isBrainLoading) return
    onSend(localText)
    setLocalText('')
  }

  const selectedMode = MODES.find((m) => m.id === currentMode) || MODES[0]
  const isSelectedModeReady = statusInfo?.setup?.[selectedMode.setupKey] ?? false

  return (
    <footer className="p-3 sm:p-4 bg-transparent relative">
      <div className="max-w-4xl mx-auto flex flex-col gap-1.5 p-1.5 bg-input border border-border/10 rounded-xl focus-within:border-accent/30 focus-within:bg-input transition-all duration-300 relative z-50 shadow-lg">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none p-2.5 px-4 text-[15px] sm:text-[16px] text-text outline-none placeholder:text-text-muted/50 disabled:opacity-50 min-w-0"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          placeholder="Mande uma mensagem para o MomAI..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        <div className="flex items-center justify-between px-2 pb-0.5">
          <div className="flex gap-2 relative">
            <div
              className={`flex items-center gap-2 border rounded-xl px-2.5 py-1.5 transition-all ${!isSelectedModeReady ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-bg/40 border-border/20 text-text-muted'}`}
            >
              <img
                src={selectedMode.icon}
                className="w-3.5 h-3.5 rounded-sm object-contain"
                alt=""
              />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {selectedMode.name}
              </span>
              {!isSelectedModeReady && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {!isSelectedModeReady && (
                <button
                  onClick={() => onOpenSettings('brain')}
                  className="ml-1 p-1 hover:bg-amber-500/20 rounded transition-colors"
                  title="Configurar Local"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            className="bg-accent/90 hover:bg-accent text-white rounded-2xl w-9 h-9 flex items-center justify-center transition-all shadow-lg shadow-accent/10 disabled:opacity-30 disabled:scale-95 group"
            onClick={handleSend}
            disabled={isLoading || isModeChanging || !localText.trim() || !isBrainReady || isBrainLoading}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${isLoading ? 'animate-pulse' : ''}`}
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </footer>
  )
}
