import { useEffect, useRef, useState } from 'react'
import { StatusData, fetchSettings, updateSettingsPartial } from '../../services/api'
import { useI18n } from '../../i18n'
import { 
  PaperAirplaneIcon, 
  StopIcon, 
  MicrophoneIcon,
  SpeakerWaveIcon
} from '@heroicons/react/24/solid'

interface ChatInputProps {
  text: string
  onSend: (text?: string) => void
  isLoading: boolean
  isModeChanging?: boolean
  statusInfo: StatusData | null
  onStopGeneration?: () => void
  isCallMode?: boolean
  onToggleCallMode?: () => void
}

const WaveIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="3" y="10" width="3" height="4" rx="1.5" />
    <rect x="8" y="7" width="3" height="10" rx="1.5" />
    <rect x="13" y="5" width="3" height="14" rx="1.5" />
    <rect x="18" y="8" width="3" height="8" rx="1.5" />
  </svg>
)

const ParamsIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    className={className}
  >
    <path d="M4 10h16M4 16h16" />
    <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

export default function ChatInput({
  text,
  onSend,
  isLoading,
  isModeChanging = false,
  statusInfo,
  onStopGeneration,
  isCallMode = false,
  onToggleCallMode
}: ChatInputProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [localText, setLocalText] = useState(text)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState({
    wake_word_enabled: true,
    tts_enabled: false
  })

  // Sync local text with external text
  useEffect(() => {
    setLocalText(text)
  }, [text])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`
    }
  }, [localText])

  useEffect(() => {
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
    <footer className="p-4 bg-transparent relative">
      <div className="max-w-4xl mx-auto relative">
        <div className="flex flex-col bg-card border border-border/20 rounded-2xl shadow-xl transition-all duration-200 focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/10">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-transparent border-none py-3 px-5 text-[15px] sm:text-[16px] text-text outline-none placeholder:text-text-muted/30 disabled:opacity-50 min-w-0 resize-none scrollbar-none"
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

          <div className="flex items-center justify-between px-3 pb-3 pt-0">
            <div className="flex items-center gap-1">
              <div className="relative voice-dropdown">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  disabled={!settingsLoaded || isSavingSettings}
                  className={`flex items-center justify-center rounded-full w-8 h-8 transition-all duration-200 ${
                    isDropdownOpen
                      ? 'bg-accent/10 text-accent'
                      : 'bg-transparent text-text-muted hover:text-text hover:bg-white/5'
                  } ${!settingsLoaded ? 'opacity-50' : ''}`}
                  title={t('chatInput.opcoesVoz')}
                >
                  <ParamsIcon className="w-4 h-4" />
                </button>

                {isDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-3 bg-card border border-border/30 rounded-xl shadow-2xl overflow-hidden min-w-[200px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <button
                      type="button"
                      onClick={() => toggleSetting('wake_word_enabled')}
                      disabled={!settingsLoaded || isSavingSettings}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all ${
                        voiceSettings.wake_word_enabled ? 'bg-accent/5 text-accent' : ''
                      }`}
                    >
                      <MicrophoneIcon className={`w-4 h-4 ${voiceSettings.wake_word_enabled ? 'text-accent' : 'text-text-muted opacity-50'}`} />
                      <div className="flex flex-col items-start flex-1">
                        <span className="text-[11px] font-bold">
                          {t('chatInput.reconhecimento')}
                        </span>
                        <span className="text-[9px] text-text-muted opacity-70">
                          {t('chatInput.reconhecimentoDesc')}
                        </span>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full ${voiceSettings.wake_word_enabled ? 'bg-accent' : 'bg-white/10'}`} />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => toggleSetting('tts_enabled')}
                      disabled={!settingsLoaded || isSavingSettings}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all border-t border-border/10 ${
                        voiceSettings.tts_enabled ? 'bg-accent/5 text-accent' : ''
                      }`}
                    >
                      <SpeakerWaveIcon className={`w-4 h-4 ${voiceSettings.tts_enabled ? 'text-accent' : 'text-text-muted opacity-50'}`} />
                      <div className="flex flex-col items-start flex-1">
                        <span className="text-[11px] font-bold">{t('chatInput.falar')}</span>
                        <span className="text-[9px] text-text-muted opacity-70">{t('chatInput.falarDesc')}</span>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full ${voiceSettings.tts_enabled ? 'bg-accent' : 'bg-white/10'}`} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center">
              {isLoading ? (
                <button
                  type="button"
                  className="bg-accent text-white rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent/20"
                  onClick={onStopGeneration}
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              ) : localText.trim() ? (
                <button
                  type="button"
                  className="bg-transparent text-text-muted rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-110 hover:text-text hover:bg-white/5 active:scale-90 disabled:opacity-40"
                  onClick={handleSend}
                  disabled={isLoading || isModeChanging || !isBrainReady || isBrainLoading}
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  className={`rounded-full w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                    isCallMode 
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                      : 'bg-white/5 text-text-muted hover:text-text hover:bg-white/10 border border-border/10'
                  }`}
                  onClick={onToggleCallMode}
                >
                  <WaveIcon className={`w-4 h-4 ${isCallMode ? 'animate-pulse' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
