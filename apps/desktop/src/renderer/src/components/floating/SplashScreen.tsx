import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'
import { StatusData } from '../../services/api'

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  statusInfo?: StatusData | null
  initMessage?: string
  initProgress?: number
  initVersion?: string
}

export default function SplashScreen({
  isFullyReady,
  initMessage,
  initProgress,
  statusInfo,
  initVersion
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [shouldRender, setShouldRender] = useState(true)

  // Sync isReady with isVisible
  useEffect(() => {
    if (isFullyReady) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => setShouldRender(false), 800)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isFullyReady])

  if (!shouldRender) return null

  const displayProgress = initProgress || 0
  const version = initVersion || statusInfo?.version || 'v0.1.0'

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#050505] flex items-center justify-center transition-all duration-700 ease-in-out ${
        isFullyReady && !isVisible ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
       {/* Background Subtle Gradient */}
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--accent-rgb),0.1)_0%,transparent_70%)] animate-pulse" />

      <div className="relative flex flex-col items-center max-w-sm w-full px-10">
        {/* Big Logo */}
        <div className="relative w-24 h-24 mb-10">
          <div className="absolute inset-[-10px] border-t-2 border-accent/20 rounded-full animate-[spin_3s_linear_infinite]" />
          <div className="absolute inset-0 bg-accent/10 blur-3xl rounded-full animate-pulse" />
          
          <div className="relative w-full h-full p-4 bg-black/40 backdrop-blur-md rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex items-center justify-center">
            <img
              src={icon}
              alt="Logo"
              className={`w-12 h-12 object-contain brightness-125 transition-all duration-1000 ${isFullyReady ? 'scale-110 rotate-[360deg]' : 'scale-100'}`}
            />
          </div>
        </div>

        <div className="text-center space-y-8 w-full relative">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-1">
              MOM<span className="text-accent">AI</span>
            </h1>
            <div className="flex items-center justify-center gap-2">
               <p className="text-[10px] text-gray-500 uppercase tracking-[0.5em] font-bold">
                 Neural OS Loading
               </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out shadow-[0_0_15px_rgba(var(--accent-rgb),0.6)]"
                style={{ width: `${displayProgress}%` }}
              />
            </div>

            <div className="flex flex-col items-center gap-2 min-h-[50px]">
               <p className="text-[11px] text-white/70 font-medium tracking-wide">
                 {initMessage}
               </p>
               <span className="text-[10px] font-mono text-accent/60 font-bold">
                 {displayProgress}%
               </span>
            </div>
          </div>
        </div>

        {/* Bottom Version */}
        <div className="absolute bottom-12 font-mono text-[9px] text-gray-500 tracking-[0.3em] uppercase opacity-40">
          Build {version}
        </div>
      </div>
    </div>
  )
}

