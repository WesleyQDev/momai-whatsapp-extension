import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'
import { InitSteps } from '../../hooks/useStatus'
import { 
  CheckCircleIcon, 
  ArrowPathIcon, 
  ExclamationCircleIcon 
} from '@heroicons/react/24/solid'

interface SplashScreenProps {
  steps: InitSteps
  status: string | null
}

export default function SplashScreen({ steps, status }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  // Consideramos pronto apenas quando TUDO está OK
  const isFullyReady = steps.api === 'ok' && 
                       steps.socket === 'ok' && 
                       steps.extensions === 'ok' && 
                       steps.brain === 'ok'

  useEffect(() => {
    if (isFullyReady) {
      const timer = setTimeout(() => setIsVisible(false), 1200)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isFullyReady])

  if (!isVisible) return null

  const renderStep = (label: string, state: 'pending' | 'ok' | 'error') => {
    return (
      <div className="flex items-center justify-between w-full group">
        <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${state === 'ok' ? 'text-white/40' : 'text-accent'}`}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {state === 'pending' && <ArrowPathIcon className="w-3 h-3 text-accent animate-spin" />}
          {state === 'ok' && <CheckCircleIcon className="w-3 h-3 text-green-500" />}
          {state === 'error' && <ExclamationCircleIcon className="w-3 h-3 text-red-500" />}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#05080f] flex flex-col items-center justify-center transition-all duration-1000 ease-in-out ${
        isFullyReady ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Tech Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative flex flex-col items-center gap-12 z-10 w-full max-w-sm px-12">
        
        {/* Animated Core Icon */}
        <div className="relative group">
          <div className="absolute inset-0 bg-accent/30 blur-2xl rounded-full group-hover:bg-accent/50 transition-all duration-700 animate-pulse" />
          <div className="relative w-28 h-28 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center p-6 shadow-2xl backdrop-blur-md">
            <img
              src={icon}
              alt="MomAI"
              className={`w-full h-full object-contain filter transition-all duration-700 ${isFullyReady ? 'brightness-125' : 'brightness-75'}`}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 w-full">
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-xl font-black text-white tracking-[0.4em] uppercase">
              Mom<span className="text-accent">AI</span>
            </h1>
            <div className="text-[8px] font-bold text-accent/40 tracking-[0.5em] uppercase">
              Initializing Core
            </div>
          </div>

          {/* Steps List */}
          <div className="w-full flex flex-col gap-3 p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
            {renderStep("Núcleo API", steps.api)}
            {renderStep("Sincronização UI", steps.socket)}
            {renderStep("Módulos & Extensões", steps.extensions)}
            {renderStep("Cérebro (LLM)", steps.brain)}
          </div>

          <div className="flex flex-col items-center gap-3 w-full">
             <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] animate-pulse">
               {status === 'waiting' ? 'Aguardando sistema...' : `Modo: ${status}`}
             </span>
             <div className="w-full h-[2px] bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-accent transition-all duration-700 ${isFullyReady ? 'w-full' : 'w-1/3 animate-loading-bar'}`}
                />
             </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 flex flex-col items-center gap-2 opacity-30">
        <div className="text-[8px] font-bold text-white uppercase tracking-[0.4em]">
          WesleyQDev • Versão Experimental
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  )
}