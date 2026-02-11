import { useState, useEffect } from 'react'
import { listMemoryNotes, NoteSummary } from '../../services/api'

interface WelcomeTipsProps {
  onSendMessage: (text: string) => void
}

const STATIC_SUGGESTIONS = [
  "Me lembre de beber água",
  "Última notícia sobre IA",
  "O que você pode fazer? (Capacidades)"
]

export default function WelcomeTips({ onSendMessage }: WelcomeTipsProps) {
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)

  useEffect(() => {
    const loadDynamic = async () => {
      try {
        const notes = await listMemoryNotes()
        // Filtra notas sem título significativo
        const validNotes = notes?.filter((note) => {
          const t = note.title.toLowerCase().trim()
          return t !== '' && t !== 'new note' && t !== 'nova nota'
        }) || []

        if (validNotes.length > 0) {
          const randomNote = validNotes[Math.floor(Math.random() * validNotes.length)]
          setDynamicSuggestion(`O que você sabe sobre "${randomNote.title}"?`)
        }
      } catch (err) {
        console.error('Erro ao carregar notas para sugestão:', err)
      }
    }
    loadDynamic()
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fade-in select-none">
      <div className="flex flex-col items-center mb-8 gap-3 opacity-60">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent animate-pulse">
              <polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polyline>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text tracking-tight italic opacity-80">
          MomAI
        </h2>
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
