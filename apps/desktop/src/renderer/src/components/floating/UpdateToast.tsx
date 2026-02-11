import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'

interface UpdateToastProps {
  installedVersion?: string
  latestVersion?: string
  onOpenSettings: (tab: 'general' | 'brain' | 'voice') => void
}

export default function UpdateToast({
  installedVersion,
  latestVersion,
  onOpenSettings
}: UpdateToastProps) {
  const { t } = useI18n()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Delay pequeno para não aparecer junto com o Splash
    const timer = setTimeout(() => setIsVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed bottom-12 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card border border-accent/30 shadow-2xl rounded-2xl p-4 w-72 flex flex-col gap-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-accent"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h4 className="text-xs font-black text-text uppercase tracking-tight">
              {t('updateToast.title')}
            </h4>
            <span className="text-[10px] text-text-muted font-medium">
              {t('updateToast.engineLabel', {
                installed: installedVersion || '... ',
                latest: latestVersion || '...'
              })}
            </span>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="ml-auto p-1 text-text-muted hover:text-text transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-[10px] text-text-muted leading-relaxed">
          {t('updateToast.description')}
        </p>

        <button
          onClick={() => {
            onOpenSettings('brain')
            setIsVisible(false)
          }}
          className="w-full py-2 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
        >
          {t('updateToast.cta')}
        </button>
      </div>
    </div>
  )
}
