import { useState, useEffect, useMemo } from 'react'
import { StatusData, listMemoryNotes, fetchSettings, SettingsData } from '../../services/api'

interface WelcomeTipsProps {
  onSendMessage: (text: string) => void
  statusInfo: StatusData | null
}

const ALL_SUGGESTIONS = [
  'O que tenho na agenda para hoje?',
  'Quais são as novidades sobre tecnologia?',
  'Me ajude a organizar minhas notas',
  'Como está o uso dos recursos do sistema?',
  'Resuma minhas notas mais recentes',
  'Quais são as suas capacidades?',
  'Mostre a interface de lembretes',
  'Como configurar o FortScript?',
  'Liste meus lembretes pendentes',
  'Qual é a previsão do tempo para hoje?',
  'Me conte uma curiosidade aleatória',
  'Verifique meus compromissos de amanhã'
]

const MAX_SUGGESTIONS = 3

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function WelcomeTips({ onSendMessage, statusInfo }: WelcomeTipsProps) {
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false

  const randomSuggestions = useMemo(() => {
    return shuffleArray(ALL_SUGGESTIONS).slice(0, MAX_SUGGESTIONS)
  }, [])

  useEffect(() => {
    // Tenta carregar do cache para aparecer instantâneo
    const cachedName = localStorage.getItem('momai_user_name')
    if (cachedName && !settings) {
      setSettings(prev => prev ? prev : { user_name: cachedName } as any)
    }

    const loadSettings = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
        if (data.user_name) {
          localStorage.setItem('momai_user_name', data.user_name)
        }
      } catch (err) {
        console.error('Erro ao carregar configurações para boas-vindas:', err)
      }
    }
    loadSettings()
  }, [statusInfo?.status]) // Mantém statusInfo como gatilho, mas roda no mount inicial tb

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
        if (e.detail.user_name) {
          localStorage.setItem('momai_user_name', e.detail.user_name)
        }
      }
    }
    window.addEventListener('momai_settings_sync', handleSync)
    return () => window.removeEventListener('momai_settings_sync', handleSync)
  }, [])

  useEffect(() => {
    const loadDynamic = async () => {
      if (!isBrainReady) return

      try {
        const notes = await listMemoryNotes()
        // Filtra notas sem título significativo
        const validNotes =
          notes?.filter((note) => {
            const t = note.title.toLowerCase().trim()
            return t !== '' && t !== 'new note' && t !== 'nova nota'
          }) || []

        if (validNotes.length > 0) {
          const randomNote = validNotes[Math.floor(Math.random() * validNotes.length)]
          setDynamicSuggestion(`Do que se trata a anotação: ${randomNote.title}`)
        }
      } catch (err) {
        console.error('Erro ao carregar notas para sugestão:', err)
      }
    }
    loadDynamic()
  }, [isBrainReady])

  const userName = settings?.user_name || ''
  const showSeparator = userName && userName !== ''

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 select-none">
      {/* Header */}
      <div className="flex flex-col items-center mb-6 text-center">
        <h2 className="text-2xl font-bold text-text tracking-tight h-8">
          Olá{showSeparator ? ', ' : ''}<span className="text-accent">{userName}</span>
        </h2>
        <p className="text-[13px] text-text-muted/60 font-medium">Como posso te ajudar hoje?</p>
      </div>

      {/* Sugestões Compactas */}
      <div className="w-full max-w-sm flex flex-col gap-1.5 mb-8">
        {/* Sugestão Dinâmica (Nota/Conhecimento) */}
        {dynamicSuggestion && (
          <button
            onClick={() => onSendMessage(dynamicSuggestion)}
            className="w-full py-2.5 px-4 rounded-lg border border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/30 text-accent transition-all text-sm font-semibold text-left flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="flex-1 truncate">{dynamicSuggestion}</span>
          </button>
        )}

        {/* Sugestões Aleatórias */}
        {randomSuggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSendMessage(suggestion)}
            id={suggestion.includes('Capacidades') ? 'tutorial-capabilities' : undefined}
            className="w-full py-2.5 px-4 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-accent/10 hover:border-accent/20 hover:text-accent transition-all text-sm font-medium text-text-muted text-left"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
