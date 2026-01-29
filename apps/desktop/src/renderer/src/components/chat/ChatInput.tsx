import { useEffect, useRef, useState } from 'react'
import icon from '../../assets/icon.png'
import geminiIcon from '../../assets/gemini-color.svg'
import groqIcon from '../../assets/groq.svg'
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
  { id: 'local', name: 'Local', icon: icon, setupKey: 'local_installed' },
  { id: 'genai', name: 'Gemini', icon: geminiIcon, setupKey: 'gemini_ready' },
  { id: 'groq', name: 'Groq', icon: groqIcon, setupKey: 'groq_ready' }
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [localText, setLocalText] = useState(text)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync local text with external text (e.g. when text is cleared after sending)
  useEffect(() => {
    setLocalText(text)
  }, [text])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          <div className="flex gap-2 relative" ref={dropdownRef}>
            <button
              type="button"
              disabled={isLoading || isModeChanging}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 border rounded-xl px-2.5 py-1.5 transition-all disabled:opacity-50 ${!isSelectedModeReady ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-bg/40 border-border/20 text-text-muted hover:text-text hover:bg-bg/60'}`}
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
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className={`transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`}
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-card border border-border/30 rounded-2xl shadow-2xl p-1.5 animate-zoom-in overflow-hidden backdrop-blur-xl">
                {MODES.map((mode) => {
                  // @ts-ignore
                  const isReady = statusInfo?.setup?.[mode.setupKey] ?? true
                  return (
                    <div key={mode.id} className="relative group/item">
                      <button
                        onClick={() => {
                          if (isReady) {
                            onModeChange(mode.id)
                            setIsDropdownOpen(false)
                          }
                        }}
                        disabled={!isReady}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${currentMode === mode.id ? 'bg-accent/10 text-accent' : isReady ? 'text-text-muted hover:bg-text/5 hover:text-text' : 'text-text-muted/30 cursor-not-allowed'}`}
                      >
                        <img
                          src={mode.icon}
                          className={`w-4 h-4 rounded-sm object-contain ${!isReady ? 'opacity-20 grayscale' : ''}`}
                          alt=""
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-wide">
                            {mode.name}
                          </span>
                          {!isReady && (
                            <span className="text-[9px] text-amber-500/60 font-bold uppercase tracking-tighter">
                              Indisponível
                            </span>
                          )}
                        </div>

                        {currentMode === mode.id && isReady && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        )}
                      </button>

                      {!isReady && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenSettings('brain')
                            setIsDropdownOpen(false)
                          }}
                          title={mode.id === 'local' ? 'Baixar Motor' : 'Configurar API'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-all shadow-sm opacity-0 group-hover/item:opacity-100"
                        >
                          {mode.id === 'local' ? (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="7 10 12 15 17 10"></polyline>
                              <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                          ) : (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M12 2v2M12 18v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
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
