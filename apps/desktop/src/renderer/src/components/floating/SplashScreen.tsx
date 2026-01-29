import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'
import { InitSteps } from '../../hooks/useStatus'
import { StatusData } from '../../services/api'

interface SplashScreenProps {
  steps: InitSteps
  status: string | null
  statusInfo: StatusData | null
}

export default function SplashScreen({ steps, status, statusInfo }: SplashScreenProps) {
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

  // Calculate the current active status message
  const getStatusMessage = () => {
    if (steps.api === 'error') return "Falha crítica na API"
    if (steps.api === 'pending') return "Iniciando protocolos de sistema..."
    
    if (steps.socket === 'error') return "Erro de comunicação visual"
    if (steps.socket === 'pending') return "Sincronizando interface de controle..."
    
    if (steps.extensions === 'error') return "Erro nos módulos externos"
    if (steps.extensions === 'pending') return "Carregando extensões e ferramentas..."
    
    if (steps.brain === 'error') return "Falha ao despertar cérebro"
    if (steps.brain === 'pending') return "Carregando núcleo de inteligência..."
    
    return "Sistemas operacionais. Bem-vindo."
  }

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#03050a] flex flex-col items-center justify-center transition-all duration-1000 ease-in-out ${
        isFullyReady ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Visual Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-accent/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent/5 blur-[150px] rounded-full" />
      </div>

      <div className="relative flex flex-col items-center gap-16 z-10 w-full max-w-sm">
        
        {/* Central Brand Icon */}
        <div className="relative group">
          <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full group-hover:bg-accent/40 transition-all duration-1000 animate-pulse" />
          <div className="relative w-32 h-32 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex items-center justify-center p-7 shadow-2xl backdrop-blur-xl">
            <img
              src={icon}
              alt="MomAI"
              className={`w-full h-full object-contain transition-all duration-1000 ${isFullyReady ? 'brightness-125 scale-110' : 'brightness-90'}`}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-10 w-full px-8">
          {/* Logo & Subtitle */}
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-[0.5em] uppercase">
              Mom<span className="text-accent">AI</span>
            </h1>
            <div className="h-[1px] w-12 bg-accent/30 rounded-full" />
          </div>

          {/* Unified Status Message */}
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="h-6 flex items-center">
              <span className="text-[11px] font-medium text-white/50 uppercase tracking-[0.25em] animate-pulse text-center">
                {getStatusMessage()}
              </span>
            </div>
            
            {/* Progress Bar Container */}
            <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden relative">
              <div 
                className={`h-full bg-accent transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] ${
                  isFullyReady ? 'w-full' : 'w-1/4 animate-loading-bar'
                }`}
              />
            </div>
            
            <div className="flex justify-between w-full px-1">
               <span className="text-[8px] font-bold text-accent/30 uppercase tracking-widest">
                 {status === 'waiting' ? 'Auto-Boot' : status}
               </span>
               <span className="text-[8px] font-bold text-white/10 uppercase tracking-widest">
                 System v{statusInfo?.version || '0.0.1'}
               </span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-3 opacity-20 hover:opacity-40 transition-opacity duration-500">
        <div className="text-[9px] font-bold text-white uppercase tracking-[0.5em]">
          MomAI Environment
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