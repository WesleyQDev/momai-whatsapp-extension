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
  const [tipFade, setTipFade] = useState(true)
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
      setTipFade(false)
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tips.length)
        setTipFade(true)
      }, 500)
    }, 7000) // Increased duration from 4500 to 7000

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

  if (!shouldRender) return null

  const displayProgress = initProgress || 0
  const currentTip = tips[currentTipIndex] || { title: '', description: '' }

  return (
    <div
      className={`fixed inset-0 z-[999] bg-bg text-text flex items-center justify-center transition-all duration-1000 ease-in-out ${
        isFullyReady && !isVisible ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Premium Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-accent/10 rounded-full blur-[140px] opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--accent),0.02)_0%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.1] mix-blend-overlay dark:opacity-[0.15]" />
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
            <span className="text-[8px] text-text/30 font-bold tracking-[0.2em] uppercase mt-1">
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
                {t('splash.tag')}
              </span>
            </div>
            
            <div className="min-h-[120px] flex flex-col justify-center">
              <div
                className={`transition-all duration-700 ease-in-out ${
                  tipFade ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                }`}
              >
                <h2 className="text-3xl font-light text-text/90 leading-tight tracking-tight mb-4">
                  {currentTip.title}
                </h2>
                <p className="text-lg text-text/40 leading-relaxed font-light">
                  {currentTip.description}
                </p>
              </div>
            </div>

            {/* Subtle Indicators */}
            <div className="flex gap-1.5 pt-4">
              {tips.map((_, i) => (
                <div
                  key={i}
                  className={`h-[2px] transition-all duration-500 ${
                    i === currentTipIndex ? 'w-8 bg-accent' : 'w-2 bg-text/5'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: Progress & Meta */}
        <div className="w-full space-y-6">
          <div className="flex items-end justify-between text-[9px] font-bold tracking-[0.2em] uppercase text-text/20 px-1">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>{initMessage || 'Engine Loading...'}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono">{elapsedTime}s</span>
              <span className="font-mono">{Math.round(displayProgress)}%</span>
            </div>
          </div>

          <div className="relative h-[2px] w-full bg-text/5 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-accent transition-all duration-700 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[8px] text-text/10 font-medium tracking-widest uppercase">
            <span>MomAI Ecosystem v0.1</span>
            <span>Local Processing Secured</span>
          </div>
        </div>
      </div>
    </div>
  )
}
