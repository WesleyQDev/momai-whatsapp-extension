import { useState, useEffect } from 'react'
import FloatingCard from './FloatingCard'

interface ModelSelectorCardProps {
  onSelect: (mode: string) => void
}

export default function ModelSelectorCard({ onSelect }: ModelSelectorCardProps) {
  const [timeLeft, setTimeLeft] = useState(15)
  const totalTime = 15

  useEffect(() => {
    if (timeLeft <= 0) {
      onSelect('local')
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, onSelect])

  const models = [
    {
      id: 'local',
      name: 'MomLocal (Qwen)',
      description: 'Llama.cpp offline, total privacidade e soberania.',
      highlight: true,
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
          <rect x="9" y="9" width="6" height="6"></rect>
          <line x1="9" y1="1" x2="9" y2="4"></line>
          <line x1="15" y1="1" x2="15" y2="4"></line>
          <line x1="9" y1="20" x2="9" y2="23"></line>
          <line x1="15" y1="20" x2="15" y2="23"></line>
        </svg>
      )
    }
  ]

  const progress = (timeLeft / totalTime) * 100

  return (
    <FloatingCard title="Inicialização do Sistema" onClose={() => onSelect('local')}>
      <div className="flex flex-col gap-6 scale-in-center">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white tracking-tight">
            Motor de Inteligência Local
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            O MomAI opera exclusivamente com processamento local para sua total privacidade.
            Utilizando <span className="text-accent font-bold uppercase">Qwen 3 4B</span>.
          </p>
        </div>

        {/* Progress Bar Container */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <span>Auto-seleção: Local</span>
            <span>{timeLeft}s</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group relative overflow-hidden ${
                model.highlight
                  ? 'bg-accent/10 border-accent/30 hover:bg-accent/20 hover:border-accent/50'
                  : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div
                className={`p-2.5 rounded-xl transition-transform group-hover:scale-110 ${
                  model.highlight ? 'bg-accent text-white' : 'bg-white/10 text-slate-400'
                }`}
              >
                {model.icon}
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-100 flex items-center gap-2">
                  {model.name}
                  {model.highlight && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/20 text-accent border border-accent/20">
                      AUTO
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                  {model.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => onSelect('groq')}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
        >
          Pular espera
        </button>
      </div>
    </FloatingCard>
  )
}
