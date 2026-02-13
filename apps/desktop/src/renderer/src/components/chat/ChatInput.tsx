import { useEffect, useRef, useState } from 'react'
import { StatusData, fetchSettings, updateSettingsPartial } from '../../services/api'
import { useI18n } from '../../i18n'

interface ChatInputProps {
  text: string
  onSend: (text?: string) => void
  isLoading: boolean
  isModeChanging?: boolean
  statusInfo: StatusData | null
  onStopGeneration?: () => void
}

export default function ChatInput({
  text,
  onSend,
  isLoading,
  isModeChanging = false,
  statusInfo,
  onStopGeneration
}: ChatInputProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localText, setLocalText] = useState(text)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
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
      if (settingsLoaded || (statusInfo && statusInfo.status !== 'ok')) return

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
  }, [statusInfo, settingsLoaded])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.voice-dropdown')) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
    return undefined
  }, [isDropdownOpen])

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
    setIsDropdownOpen(false)

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
          placeholder={t('chatInput.placeholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        <div className="flex items-center justify-between px-2 pb-0.5">
          <div className="relative voice-dropdown">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={!settingsLoaded || isSavingSettings}
              className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 transition-all ${
                isDropdownOpen
                  ? 'bg-accent/20 border-accent/40 text-text'
                  : 'bg-bg/40 border-border/20 text-text-muted'
              } ${!settingsLoaded ? 'opacity-60' : ''}`}
              title={t('chatInput.opcoesVoz')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              <span className="text-[9px] font-bold">{t('chatInput.voz')}</span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-2 bg-card border border-border/30 rounded-xl shadow-xl overflow-hidden min-w-[160px] z-50">
                <button
                  type="button"
                  onClick={() => toggleSetting('wake_word_enabled')}
                  disabled={!settingsLoaded || isSavingSettings}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-all ${
                    voiceSettings.wake_word_enabled ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold text-text">
                      {t('chatInput.reconhecimento')}
                    </span>
                    <span className="text-[9px] text-text-muted">
                      {t('chatInput.reconhecimentoDesc')}
                    </span>
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full ${voiceSettings.wake_word_enabled ? 'bg-green-500' : 'bg-text-muted/30'}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => toggleSetting('tts_enabled')}
                  disabled={!settingsLoaded || isSavingSettings}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-all border-t border-border/20 ${
                    voiceSettings.tts_enabled ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold text-text">{t('chatInput.falar')}</span>
                    <span className="text-[9px] text-text-muted">{t('chatInput.falarDesc')}</span>
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full ${voiceSettings.tts_enabled ? 'bg-green-500' : 'bg-text-muted/30'}`}
                  />
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <button
              type="button"
              className="bg-accent/90 hover:bg-accent text-white rounded-2xl w-9 h-9 flex items-center justify-center transition-all shadow-lg shadow-accent/10"
              onClick={onStopGeneration}
              title="Parar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
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
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          )}
        </div>
      </div>
    </footer>
  )
}
