import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  initMessage?: string
  initProgress?: number
  onFinished?: () => void
}

const TIPS = [
  {
    title: 'Conforto Visual',
    description: 'Personalize sua experiência alternando entre o tema Claro e Escuro nas configurações.'
  },
  {
    title: 'Sua Assistente, Sua Voz',
    description: 'Escolha entre diferentes vozes e idiomas para que a MomAI se adapte perfeitamente a você.'
  },
  {
    title: 'Interação por Voz',
    description: 'Você pode ativar ou desativar a Wake Word nas configurações para chamar a assistente apenas quando desejar.'
  },
  {
    title: 'Modo de Economia',
    description: 'Adicione programas pesados ao Modo Economia para otimizar o desempenho da IA.'
  },
  {
    title: 'Organização Ativa',
    description: 'Peça lembretes para a MomAI e solicite informações sobre seus compromissos a qualquer momento.'
  },
  {
    title: 'Aba de Anotações',
    description: 'Escreva ideias rápidas na aba de notas e peça para a assistente analisá-las para você.'
  },
  {
    title: 'Memória em Camadas',
    description: 'Curiosidade: A MomAI possui 3 níveis de memória — Permanente, Episódica e de Curto Prazo.'
  },
  {
    title: 'Busca em Tempo Real',
    description: 'Curiosidade: A assistente consegue pesquisar informações na internet usando o DuckDuckGo.'
  }
]

export default function SplashScreen({
  isFullyReady,
  initMessage,
  initProgress,
  onFinished
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [shouldRender, setShouldRender] = useState(true)
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [tipFade, setTipFade] = useState(true)

  // Sync isReady with isVisible
  useEffect(() => {
    if (isFullyReady) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        // Avisa que terminou de vez após a transição de fade (800ms)
        setTimeout(() => {
          setShouldRender(false)
          if (onFinished) onFinished()
        }, 800)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isFullyReady])

  // Tip carousel logic
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setTipFade(false)
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % TIPS.length)
        setTipFade(true)
      }, 500)
    }, 4500)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!shouldRender) return null

  const displayProgress = initProgress || 0

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#020202] text-white flex items-center justify-center transition-all duration-1000 ease-in-out ${
        isFullyReady && !isVisible ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Premium Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-accent/10 rounded-full blur-[140px] opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--accent),0.02)_0%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay" />
      </div>

      <div className="relative h-full w-full flex flex-col justify-between p-12">
        {/* Top: Subtle Branding */}
        <div className="flex items-center gap-4 animate-fade-in">
          <img
            src={icon}
            alt="Logo"
            className="w-8 h-8 object-contain brightness-125 opacity-80"
          />
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-[0.3em] uppercase leading-none">
              MOM<span className="text-accent">AI</span>
            </h1>
            <span className="text-[8px] text-white/20 font-bold tracking-[0.2em] uppercase mt-1">
              Personal Intelligence
            </span>
          </div>
        </div>

        {/* Center: The Content (Tip) */}
        <div className="max-w-md animate-slide-in-up">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-[1px] w-8 bg-accent/40" />
              <span className="text-[10px] text-accent font-bold tracking-[0.3em] uppercase">
                Productivity Tip
              </span>
            </div>
            
            <div className="min-h-[120px] flex flex-col justify-center">
              <div
                className={`transition-all duration-700 ease-in-out ${
                  tipFade ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                }`}
              >
                <h2 className="text-3xl font-light text-white/90 leading-tight tracking-tight mb-4">
                  {TIPS[currentTipIndex].title}
                </h2>
                <p className="text-lg text-white/40 leading-relaxed font-light">
                  {TIPS[currentTipIndex].description}
                </p>
              </div>
            </div>

            {/* Subtle Indicators */}
            <div className="flex gap-1.5 pt-4">
              {TIPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-[2px] transition-all duration-500 ${
                    i === currentTipIndex ? 'w-8 bg-accent' : 'w-2 bg-white/5'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: Progress & Meta */}
        <div className="w-full space-y-6">
          <div className="flex items-end justify-between text-[9px] font-bold tracking-[0.2em] uppercase text-white/20 px-1">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>{initMessage || 'Engine Loading...'}</span>
            </div>
            <span className="font-mono">{Math.round(displayProgress)}%</span>
          </div>

          <div className="relative h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-accent transition-all duration-700 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[8px] text-white/10 font-medium tracking-widest uppercase">
            <span>MomAI Ecosystem v1.0</span>
            <span>Local Processing Secured</span>
          </div>
        </div>
      </div>
    </div>
  )
}
