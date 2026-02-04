import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'
import { StatusData } from '../../services/api'

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  statusInfo?: StatusData | null
  initMessage?: string
  initProgress?: number
}

export default function SplashScreen({ isFullyReady, initMessage, initProgress }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  
  // Mostrar splash apenas se demorar mais de 300ms
  useEffect(() => {
    const showTimer = setTimeout(() => {
      if (!isFullyReady) {
        setIsVisible(true)
      }
    }, 300)

    return () => clearTimeout(showTimer)
  }, [isFullyReady])

  // Timeout de 60 segundos (mais generoso para primeira instalação)
  useEffect(() => {
    const timeoutTimer = setTimeout(() => {
      if (!isFullyReady) {
        console.warn('[SplashScreen] Timeout atingido.')
        setHasTimedOut(true)
        setIsVisible(false)
      }
    }, 60000)

    return () => clearTimeout(timeoutTimer)
  }, [isFullyReady])

  // Fade out suave
  useEffect(() => {
    if (isFullyReady && isVisible) {
      const timer = setTimeout(() => setIsVisible(false), 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isFullyReady, isVisible])

  if (!isVisible || hasTimedOut) return null

  const displayProgress = initProgress || 0

  return (
    <div className={`fixed inset-0 z-[999] bg-[#03050a] flex items-center justify-center transition-all duration-700 ${
      isFullyReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}>
      {/* Background Subtle Gradient */}
      <div className="absolute inset-0 bg-radial-at-c from-accent/5 to-transparent opacity-30" />
      
      <div className="relative flex flex-col items-center max-w-sm w-full px-6">
        {/* Logo with pulse glow */}
        <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full animate-pulse" />
            <img src={icon} alt="Logo" className="relative w-full h-full object-contain brightness-110" />
        </div>
        
        <div className="text-center space-y-6 w-full">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-white tracking-tight">MOM<span className="text-accent">AI</span></h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-medium">Iniciando Sistema</p>
            </div>

            <div className="space-y-3">
                {/* Progress Bar */}
                <div className="w-full relative h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
                        style={{ width: `${displayProgress}%` }}
                    />
                </div>
                
                {/* Info & Percentage */}
                <div className="flex flex-col items-center gap-2">
                    <div className="flex justify-between w-full px-0.5">
                        <span className="text-[10px] font-mono text-accent/80 animate-pulse uppercase tracking-wider">
                            {displayProgress < 100 ? 'Carregando...' : 'Pronto'}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">{displayProgress}%</span>
                    </div>
                    
                    {/* Dynamic Message */}
                    <p className="text-xs text-gray-400 font-medium h-4 truncate">
                        {initMessage}
                    </p>
                </div>
            </div>
        </div>

        {/* Bottom Version */}
        <div className="absolute bottom-12 font-mono text-[9px] text-gray-600 tracking-widest">
            STABLE RELEASE v0.1.0
        </div>
      </div>
    </div>
  )
}