import { useState, useEffect } from 'react'

export default function FortScriptToast() {
  const [event, setEvent] = useState<{ status: 'active' | 'inactive'; timestamp: string } | null>(
    null
  )
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleEvent = (e: any) => {
      setEvent(e.detail)
      setIsVisible(true)

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 5000)

      return () => clearTimeout(timer)
    }

    window.addEventListener('momai_fortscript_event', handleEvent)
    return () => window.removeEventListener('momai_fortscript_event', handleEvent)
  }, [])

  if (!event || !isVisible) return null

  const isActive = event.status === 'active'

  return (
    <div className="fixed bottom-24 right-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div
        className={`p-4 rounded-2xl border shadow-2xl flex items-center gap-4 min-w-[320px] backdrop-blur-xl ${
          isActive
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-card/80 border-border/50 text-text'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isActive ? 'bg-accent/20' : 'bg-black/20'
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={isActive ? 'animate-pulse' : ''}
          >
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-widest">
              FortScript Engine
            </span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent animate-pulse' : 'bg-text-muted'}`}
            />
          </div>
          <span className="text-[13px] font-bold leading-tight mt-0.5">
            {isActive ? 'Modo Economia Ativado' : 'Sistemas Restaurados'}
          </span>
          <p className="text-[10px] opacity-70 mt-1 leading-relaxed">
            {isActive
              ? 'Processos pesados detectados. IA e Voz suspensos para performance.'
              : 'Monitoramento em espera. IA e Voz prontos para uso.'}
          </p>
        </div>

        <button
          onClick={() => setIsVisible(false)}
          className="ml-auto p-1 hover:bg-black/10 rounded transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
