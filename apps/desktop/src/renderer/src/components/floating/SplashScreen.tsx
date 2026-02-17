
import { useEffect, useState, useMemo } from 'react'
import icon from '../../assets/icon.png'
import { useI18n } from '../../i18n'

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  initMessage?: string
  initProgress?: number
  onFinished?: () => void
}

export default function SplashScreen({
  isFullyReady,
  initMessage,
  initProgress,
  onFinished
}: SplashScreenProps) {
  const { t } = useI18n()
  const [isVisible, setIsVisible] = useState(true)
  const [shouldRender, setShouldRender] = useState(true)
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  // Load tips from i18n
  const tips = useMemo(() => {
    const count = parseInt(t('splash.tip.count')) || 0
    return Array.from({ length: count }).map((_, i) => ({
      title: t(`splash.tip.title.${i}`),
      description: t(`splash.tip.desc.${i}`)
    }))
  }, [t])

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
    if (!isVisible || tips.length === 0) return

    const interval = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tips.length)
        setIsTransitioning(false)
      }, 500)
    }, 6000)

    return () => clearInterval(interval)
  }, [isVisible, tips.length])

  // Elapsed time counter
  useEffect(() => {
    if (isFullyReady) return
    const startTime = Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isFullyReady])

  // Fake progress to avoid 0% stagnation
  const [visualProgress, setVisualProgress] = useState(0)

  useEffect(() => {
    // Smoothly interpolate between current visual progress and actual initProgress
    // But also ensure it's always moving slightly even if initProgress is 0
    const target = Math.max(initProgress || 0, 5) // Min 5%
    
    const interval = setInterval(() => {
        setVisualProgress(prev => {
            const step = (target - prev) * 0.1
            const next = prev + step + 0.1 // Always add a tiny bit of movement
            return Math.min(next, 95) // Cap at 95 until actually done
        })
    }, 50)
    
    return () => clearInterval(interval)
  }, [initProgress])

  if (!shouldRender) return null

  const currentTip = tips[currentTipIndex] || { title: '', description: '' }
  const totalTips = tips.length || 1

  return (
    <div
      className={`fixed inset-0 z-[999] bg-bg text-text flex items-center justify-center transition-all duration-1000 ease-in-out font-sans select-none overflow-hidden ${
        isFullyReady && !isVisible
          ? 'opacity-0 scale-105 pointer-events-none blur-sm'
          : 'opacity-100 scale-100 blur-0'
      }`}
    >
      {/* Background Layer with Original Premium Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Deep background color */}
        <div className="absolute inset-0 bg-bg" />
        
        {/* Soft radial gradients for depth - Restored */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
        
        {/* Subtle noise texture - Restored */}
        <div className="absolute inset-0 opacity-[0.1] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        
        {/* Vignette effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
      </div>

      {/* Main Content Container */}
      <div className="relative w-full h-full max-w-4xl mx-auto flex flex-col justify-between p-16 z-10">
        
        {/* Header: Original Branding Style */}
        <header className="flex items-center gap-4 animate-fade-in opacity-0" style={{ animationDelay: '100ms' }}>
          <div className="relative group">
            <div className="absolute inset-0 bg-accent/20 rounded-full blur-md group-hover:bg-accent/30 transition-all duration-500" />
            <img
              src={icon}
              alt="MomAI Logo"
              className="w-10 h-10 object-contain relative z-10 drop-shadow-lg"
            />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-bold tracking-[0.25em] text-text leading-none">
              MOM<span className="text-accent">AI</span>
            </h1>
            <span className="text-[10px] uppercase tracking-[0.3em] text-text/40 mt-1 font-medium">
              Personal Intelligence
            </span>
          </div>
        </header>

        {/* Center: Tips Carousel - Restored Typography */}
        <main className="flex-1 flex flex-col justify-center items-start max-w-2xl animate-slide-in-up opacity-0" style={{ animationDelay: '300ms' }}>
          
          <div className="relative min-h-[160px] w-full">
             <div
                className={`transition-all duration-500 ease-in-out transform ${
                  isTransitioning 
                    ? 'opacity-0 translate-y-4 filter blur-sm' 
                    : 'opacity-100 translate-y-0 filter blur-0'
                }`}
              >
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-[2px] w-8 bg-accent rounded-full" />
                    <span className="text-xs font-bold tracking-[0.2em] text-accent uppercase">
                      {t('splash.tag')}
                    </span>
                </div>
                
                <h2 className="text-4xl font-light text-text leading-tight mb-4 tracking-tight">
                  {currentTip.title}
                </h2>
                <p className="text-lg text-text/50 leading-relaxed font-light max-w-xl">
                  {currentTip.description}
                </p>
             </div>
          </div>

          {/* Dots - Restored Style */}
          <div className="flex items-center gap-2 mt-8">
            {tips.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === currentTipIndex ? 'w-8 bg-accent' : 'w-2 bg-text/10'
                }`}
              />
            ))}
          </div>

        </main>

        {/* Footer: Clean Layout but with Restored Colors/Fonts */}
        <footer className="w-full mt-auto animate-fade-in opacity-0" style={{ animationDelay: '500ms' }}>
          <div className="flex flex-col gap-4 max-w-md">
            
            {/* Info Line - Restored Font Style */}
            <div className="flex justify-between items-end text-[10px] font-bold tracking-[0.15em] uppercase text-text/30">
                <span className="text-accent/80">{initMessage || 'Loading...'}</span>
                <span className="font-mono opacity-60">{elapsedTime}s</span>
            </div>

            {/* Loading Bar - Thicker as requested, but with original styles */}
            <div className="relative h-1 w-full bg-text/5 overflow-hidden rounded-full">
              <div
                className="absolute top-0 left-0 h-full bg-accent shadow-[0_0_10px_rgba(var(--accent),0.5)] transition-all duration-100 ease-linear"
                style={{ width: `${visualProgress}%` }}
              />
            </div>
            
          </div>
        </footer>
      </div>
    </div>
  )
}
