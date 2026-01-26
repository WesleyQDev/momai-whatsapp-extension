import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'

interface SplashScreenProps {
  isReady: boolean
  status: string | null
}

export default function SplashScreen({ isReady, status }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [displayStatus, setDisplayStatus] = useState('Iniciando sistemas...')

  useEffect(() => {
    if (status) {
      if (status === 'waiting') setDisplayStatus('Aguardando definição de cérebro...')
      else if (status === 'local') setDisplayStatus('Carregando Motor Local (Llama.cpp)...')
      else if (status === 'groq') setDisplayStatus('Conectando ao Groq Cloud...')
      else if (status === 'genai') setDisplayStatus('Sincronizando com Google AI Studio...')
      else setDisplayStatus(`Preparando ${status}...`)
    }
  }, [status])

  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => setIsVisible(false), 800)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isReady])

  if (!isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#05080f] flex flex-col items-center justify-center transition-all duration-1000 ease-in-out ${
        isReady ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative mb-12">
        {/* Glow Effects */}
        <div className="absolute inset-0 bg-accent/20 blur-[60px] rounded-full animate-pulse"></div>
        <div className="absolute inset-0 bg-accent/10 blur-[120px] rounded-full"></div>

        {/* Main Icon */}
        <div className="relative z-10 w-32 h-32 rounded-3xl bg-white/[0.03] border border-white/10 flex items-center justify-center p-6 shadow-2xl backdrop-blur-xl animate-in zoom-in-75 duration-700">
          <img
            src={icon}
            alt="MomAI"
            className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(139,92,246,0.5)] animate-pulse"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 max-w-xs w-full">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-black text-white tracking-[0.2em] uppercase">
            Mom<span className="text-accent">AI</span>
          </h1>
          <div className="h-px w-12 bg-accent/30"></div>
        </div>

        <div className="flex flex-col items-center gap-4 w-full px-8">
          <span className="text-[10px] font-black text-accent uppercase tracking-[0.3em] text-center animate-pulse">
            {displayStatus}
          </span>

          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full bg-accent transition-all duration-1000 ease-out ${isReady ? 'w-full' : 'w-1/2 animate-[loading_2s_infinite]'}`}
            ></div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 text-[10px] font-bold text-white/20 uppercase tracking-[0.4em]">
        Sistema de Inteligência Virtual • v0.1
      </div>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
