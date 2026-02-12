import { useState, useEffect } from 'react'
import { StatusData, listMemoryNotes, fetchSettings, SettingsData } from '../../services/api'

interface WelcomeTipsProps {
  onSendMessage: (text: string) => void
  statusInfo: StatusData | null
}

const STATIC_SUGGESTIONS = [
  "Liste meus compromissos",
  "Buscar algo aleatorio na internet",
  "O que MomAI consegue fazer?"
]

export default function WelcomeTips({ onSendMessage, statusInfo }: WelcomeTipsProps) {
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
      } catch (err) {
        console.error('Erro ao carregar configurações para boas-vindas:', err)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    const loadDynamic = async () => {
      if (!isBrainReady) return

      try {
        const notes = await listMemoryNotes()
        // Filtra notas sem título significativo
        const validNotes = notes?.filter((note) => {
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

  const userName = settings?.user_name || 'Senhor'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fade-in select-none">
      <div className="flex flex-col items-center mb-8 gap-1">
        <h2 className="text-2xl font-bold text-text tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-700">
          Olá, <span className="text-white">{userName}</span>
        </h2>
        <p className="text-[13px] text-text-muted/60 font-medium">
          Como posso te ajudar hoje?
        </p>
      </div>


      <div className="w-full max-w-sm flex flex-col gap-2">
        {/* Sugestão Dinâmica (Nota/Conhecimento) */}
        {dynamicSuggestion && (
          <button
            onClick={() => onSendMessage(dynamicSuggestion)}
            className="w-full py-2.5 px-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/30 text-accent transition-all text-sm font-semibold text-left flex items-center gap-2 group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="flex-1 truncate">{dynamicSuggestion}</span>
          </button>
        )}

        {/* Sugestões Fixas */}
        {STATIC_SUGGESTIONS.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSendMessage(suggestion)}
            id={suggestion.includes('Capacidades') ? 'tutorial-capabilities' : undefined}
            className="w-full py-2.5 px-4 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-accent/10 hover:border-accent/20 hover:text-accent transition-all text-sm font-medium text-text-muted text-left"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
