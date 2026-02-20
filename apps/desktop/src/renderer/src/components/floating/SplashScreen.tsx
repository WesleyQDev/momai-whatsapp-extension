import { useEffect, useState, useMemo, useCallback } from 'react'
import icon from '../../assets/icon.png'
import { useI18n } from '../../i18n'

interface BootstrapError {
  type: string
  message: string
  details?: string
}

interface SplashScreenProps {
  isFullyReady: boolean
  status?: string | null
  initMessage?: string
  initProgress?: number
  onFinished?: () => void
}

const errorMessages: Record<string, { title: string; solution: string }> = {
  python_not_found: {
    title: 'Python Required',
    solution: 'Install Python 3.12+ from python.org/downloads/'
  },
  uv_not_found: {
    title: 'Installation Error',
    solution: 'Restart the app or reinstall MomAI'
  },
  venv_failed: {
    title: 'Environment Error',
    solution: 'Check antivirus permissions and try again'
  },
  sync_failed: {
    title: 'Dependency Error',
    solution: 'Check internet connection and antivirus settings'
  },
  permission_denied: {
    title: 'Permission Denied',
    solution: 'Run as administrator or check folder permissions'
  },
  startup_failed: {
    title: 'Startup Failed',
    solution: 'Check logs for details'
  },
  unknown: {
    title: 'Unknown Error',
    solution: 'Check logs for details'
  },
  missing_vc_redist: {
    title: 'Missing Component',
    solution: 'Install Microsoft Visual C++ Redistributable (aka.ms/vs/17/release/vc_redist.x64.exe)'
  }
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
  const [bootstrapError, setBootstrapError] = useState<BootstrapError | null>(null)

  useEffect(() => {
    if (!window.api?.onBootstrapError) return

    const removeListener = window.api.onBootstrapError((error: BootstrapError) => {
      console.error('[SplashScreen] Bootstrap error received:', error)
      setBootstrapError(error)
    })

    return removeListener
  }, [])

  const handleOpenLogs = useCallback(async () => {
    if (window.api?.openLogsFolder) {
      await window.api.openLogsFolder()
    }
  }, [])

  const tips = useMemo(() => {
    const count = parseInt(t('splash.tip.count')) || 0
    return Array.from({ length: count }).map((_, i) => ({
      title: t(`splash.tip.title.${i}`),
      description: t(`splash.tip.desc.${i}`)
    }))
  }, [t])

  useEffect(() => {
    if (isFullyReady) {
      setVisualProgress(100)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => {
          setShouldRender(false)
          if (onFinished) onFinished()
        }, 800)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isFullyReady])

  useEffect(() => {
    if (!isVisible || tips.length === 0 || bootstrapError) return

    const interval = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % tips.length)
        setIsTransitioning(false)
      }, 500)
    }, 6000)

    return () => clearInterval(interval)
  }, [isVisible, tips.length, bootstrapError])

  useEffect(() => {
    if (isFullyReady || bootstrapError) return
    const startTime = Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isFullyReady, bootstrapError])

  const [visualProgress, setVisualProgress] = useState(0)

  useEffect(() => {
    if (bootstrapError) return
    const target = Math.max(initProgress || 0, 5)

    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        const step = (target - prev) * 0.1
        const next = prev + step + 0.1
        return Math.min(next, (initProgress || 0) >= 100 ? 100 : 95)
      })
    }, 50)

    return () => clearInterval(interval)
  }, [initProgress, bootstrapError])

  if (!shouldRender) return null

  const currentTip = tips[currentTipIndex] || { title: '', description: '' }
  const errorInfo = bootstrapError
    ? errorMessages[bootstrapError.type] || errorMessages.unknown
    : null

  return (
    <div
      className={`fixed inset-0 z-[999] bg-bg text-text flex items-center justify-center transition-all duration-1000 ease-in-out font-sans select-none overflow-hidden ${
        isFullyReady && !isVisible
          ? 'opacity-0 scale-105 pointer-events-none blur-sm'
          : 'opacity-100 scale-100 blur-0'
      }`}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.1] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
      </div>

      <div className="relative w-full h-full max-w-4xl mx-auto flex flex-col justify-between p-16 z-10">
        <header
          className="flex items-center gap-4 animate-fade-in opacity-0"
          style={{ animationDelay: '100ms' }}
        >
          <div className="relative group">
            <div
              className={`absolute inset-0 rounded-full blur-md group-hover:rounded-full transition-all duration-500 ${bootstrapError ? 'bg-red-500/20' : 'bg-accent/20'}`}
            />
            <img
              src={icon}
              alt="MomAI Logo"
              className={`w-10 h-10 object-contain relative z-10 drop-shadow-lg ${bootstrapError ? 'opacity-50' : ''}`}
            />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-bold tracking-[0.25em] text-text leading-none">
              MOM<span className={bootstrapError ? 'text-red-400' : 'text-accent'}>AI</span>
            </h1>
            <span className="text-[10px] uppercase tracking-[0.3em] text-text/40 mt-1 font-medium">
              Personal Intelligence
            </span>
          </div>
        </header>

        {bootstrapError && errorInfo ? (
          <main
            className="flex-1 flex flex-col justify-center items-start max-w-2xl animate-slide-in-up opacity-0"
            style={{ animationDelay: '300ms' }}
          >
            <div className="w-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-[2px] w-8 bg-red-400 rounded-full" />
                <span className="text-xs font-bold tracking-[0.2em] text-red-400 uppercase">
                  Error
                </span>
              </div>

              <h2 className="text-4xl font-light text-text leading-tight mb-4 tracking-tight">
                {errorInfo.title}
              </h2>
              <p className="text-lg text-text/50 leading-relaxed font-light max-w-xl mb-6">
                {bootstrapError.message}
              </p>

              {bootstrapError.details && (
                <div className="bg-text/5 border border-text/10 rounded-lg p-4 mb-6 max-w-xl">
                  <p className="text-sm text-text/40 font-mono break-all">
                    {bootstrapError.details}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <p className="text-sm text-text/60">
                  <span className="text-accent font-medium">Solution:</span> {errorInfo.solution}
                </p>

                <button
                  onClick={handleOpenLogs}
                  className="flex items-center gap-2 px-4 py-2 bg-text/5 hover:bg-text/10 border border-text/10 rounded-lg text-sm text-text/70 hover:text-text transition-colors w-fit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  Open Logs Folder
                </button>
              </div>
            </div>
          </main>
        ) : (
          <main
            className="flex-1 flex flex-col justify-center items-start max-w-2xl animate-slide-in-up opacity-0"
            style={{ animationDelay: '300ms' }}
          >
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
        )}

        <footer
          className="w-full mt-auto animate-fade-in opacity-0"
          style={{ animationDelay: '500ms' }}
        >
          <div className="flex flex-col gap-4 max-w-md">
            <div className="flex justify-between items-end text-[10px] font-bold tracking-[0.15em] uppercase text-text/30">
              <span className={bootstrapError ? 'text-red-400' : 'text-accent/80'}>
                {bootstrapError ? 'Error' : initMessage || 'Loading...'}
              </span>
              <span className="font-mono opacity-60">{elapsedTime}s</span>
            </div>

            <div className="relative h-1 w-full bg-text/5 overflow-hidden rounded-full">
              <div
                className={`absolute top-0 left-0 h-full transition-all duration-100 ease-linear ${
                  bootstrapError
                    ? 'bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : 'bg-accent shadow-[0_0_10px_rgba(var(--accent),0.5)]'
                }`}
                style={{ width: bootstrapError ? '100%' : `${visualProgress}%` }}
              />
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
