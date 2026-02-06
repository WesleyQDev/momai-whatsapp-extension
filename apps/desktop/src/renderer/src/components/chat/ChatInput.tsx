import { useEffect, useRef, useState } from 'react'
import { StatusData, fetchSettings, updateSettingsPartial } from '../../services/api'

interface ChatInputProps {
  text: string
  onSend: (text?: string) => void
  isLoading: boolean
  isModeChanging?: boolean
  statusInfo: StatusData | null
}

export default function ChatInput({
  text,
  onSend,
  isLoading,
  isModeChanging = false,
  statusInfo
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localText, setLocalText] = useState(text)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState({
    wake_word_enabled: true,
    tts_enabled: false
  })

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

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await fetchSettings()
        setVoiceSettings({
          wake_word_enabled: !!data.wake_word_enabled,
          tts_enabled: !!data.tts_enabled
        })
        setSettingsLoaded(true)
      } catch (error) {
        console.error('Erro ao carregar configuracoes:', error)
      }
    }

    loadSettings()
  }, [])

  const handleSend = () => {
    if (!localText.trim() || isLoading || isModeChanging || !isBrainReady || isBrainLoading) return
    onSend(localText)
    setLocalText('')
  }

  const toggleSetting = async (key: 'wake_word_enabled' | 'tts_enabled') => {
    if (!settingsLoaded || isSavingSettings) return

    const previous = voiceSettings[key]
    const next = !previous
    setVoiceSettings((prev) => ({ ...prev, [key]: next }))
    setIsSavingSettings(true)

    try {
      await updateSettingsPartial({ [key]: next })
    } catch (error) {
      console.error('Erro ao atualizar configuracoes:', error)
      setVoiceSettings((prev) => ({ ...prev, [key]: previous }))
    } finally {
      setIsSavingSettings(false)
    }
  }

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
            <button
              type="button"
              onClick={() => toggleSetting('wake_word_enabled')}
              disabled={!settingsLoaded || isSavingSettings}
              className={`flex items-center gap-2 border rounded-xl px-2.5 py-1.5 transition-all ${
                voiceSettings.wake_word_enabled
                  ? 'bg-bg/40 border-border/20 text-text-muted'
                  : 'bg-bg/30 border-border/15 text-text-muted/70'
              } ${!settingsLoaded ? 'opacity-60' : ''}`}
              title="Wake word"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">Wake</span>
              <span className="text-[9px] font-mono tracking-wider">
                {voiceSettings.wake_word_enabled ? 'On' : 'Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleSetting('tts_enabled')}
              disabled={!settingsLoaded || isSavingSettings}
              className={`flex items-center gap-2 border rounded-xl px-2.5 py-1.5 transition-all ${
                voiceSettings.tts_enabled
                  ? 'bg-bg/40 border-border/20 text-text-muted'
                  : 'bg-bg/30 border-border/15 text-text-muted/70'
              } ${!settingsLoaded ? 'opacity-60' : ''}`}
              title="TTS"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">TTS</span>
              <span className="text-[9px] font-mono tracking-wider">
                {voiceSettings.tts_enabled ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          <button
            type="button"
            className="bg-accent/90 hover:bg-accent text-white rounded-2xl w-9 h-9 flex items-center justify-center transition-all shadow-lg shadow-accent/10 disabled:opacity-30 disabled:scale-95 group"
            onClick={handleSend}
            disabled={
              isLoading || isModeChanging || !localText.trim() || !isBrainReady || isBrainLoading
            }
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
