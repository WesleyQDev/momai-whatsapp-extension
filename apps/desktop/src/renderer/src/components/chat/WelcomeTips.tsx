import { useState, useEffect, useMemo } from 'react'
import { StatusData, listMemoryNotes, fetchSettings, SettingsData } from '../../services/api'

interface WelcomeTipsProps {
  onSendMessage: (text: string) => void
  statusInfo: StatusData | null
}

const ALL_SUGGESTIONS = [
  'Liste meus compromissos de hoje',
  'Liste meus compromissos de amanha',
  'Criar lembrete para amanha as 9h',
  'O que tenho na agenda para esta semana?',
  'Listar minhas anotacoes',
  'Criar anotacao: Compras do mes',
  'Do que trata minha ultima anotacao?',
  'O que MomAI consegue fazer?',
  'Me explique como funciona a interface',
  'Quais extensoes estao instaladas?',
  'Me conte uma piada',
  'Qual e o clima hoje?',
  'Me ensine algo novo',
  'Faca uma resumo do dia',
  'Liste meus lembretes pendentes',
  'Quando e meu proximo evento?',
  'Editar configuracoes de voz',
  'Ver status do sistema',
  'Buscar palavra no meu conhecimento',
  'Explicar como usar lembretes'
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

  const userName = settings?.user_name || 'Senhor'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fade-in select-none">
      <div className="flex flex-col items-center mb-8 gap-1">
        <h2 className="text-2xl font-bold text-text tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-700">
          Olá, <span className="text-white">{userName}</span>
        </h2>
        <p className="text-[13px] text-text-muted/60 font-medium">Como posso te ajudar hoje?</p>
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

        {/* Sugestoes Aleatorias */}
        {randomSuggestions.map((suggestion, index) => (
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
