import { useEffect, useState } from 'react'
import icon from '../../assets/icon.png'

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  initMessage?: string
  initProgress?: number
}

export default function SplashScreen({
  isFullyReady,
  initMessage,
  initProgress
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
    return undefined
  }, [isFullyReady])

  if (!shouldRender) return null

  const displayProgress = initProgress || 0

  return (
    <div
      className={`fixed inset-0 z-[999] bg-[#050505] flex items-center justify-center transition-all duration-700 ease-in-out ${
        isFullyReady && !isVisible
          ? 'opacity-0 scale-105 pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--accent-rgb),0.08)_0%,transparent_70%)]" />

      <div className="relative flex flex-col items-center max-w-xs w-full px-8">
        <div className="relative w-24 h-12 mb-6 flex items-center justify-center">
          <img
            src={icon}
            alt="Logo"
            className="w-8 h-8 object-contain brightness-110 transition-transform duration-700"
          />
        </div>

        <div className="text-center space-y-6 w-full relative">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-1">
              MOM<span className="text-accent">AI</span>
            </h1>
          </div>

          <div className="space-y-2.5">
            <div className="w-full h-px bg-white/10 rounded-full overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${displayProgress}%` }}
              />
            </div>

            <div className="flex flex-col items-center gap-1 min-h-[28px]">
              <p className="text-[10px] text-white/70 font-medium tracking-wide">{initMessage}</p>
            </div>
          </div>
        </div>

        {/* Bottom Version */}
      </div>
    </div>
  )
}
