import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'

export default function AutoUpdateCard() {
  const { t } = useI18n()
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [status, setStatus] = useState<'available' | 'downloading' | 'ready' | 'error' | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!window.api) return

    const cleanupAvailable = window.api.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setStatus('available')
    })

    const cleanupProgress = window.api.onUpdateProgress((prog) => {
      setStatus('downloading')
      setProgress(prog.percent)
    })

    const cleanupDownloaded = window.api.onUpdateDownloaded(() => {
      setStatus('ready')
    })

    const cleanupError = window.api.onUpdateError((err) => {
      console.error('Update error:', err)
      setStatus('error')
    })

    return () => {
      cleanupAvailable()
      cleanupProgress()
      cleanupDownloaded()
      cleanupError()
    }
  }, [])

  if (!status) return null

  const handleDownload = async () => {
    setStatus('downloading')
    setProgress(0)
    await window.api.downloadUpdate()
  }

  const handleInstall = async () => {
    await window.api.quitAndInstallUpdate()
  }

  const handleClose = () => {
    setStatus(null)
  }

  return (
    <div className="fixed top-6 right-6 z-[200] animate-in fade-in slide-in-from-right duration-500">
      <div className="bg-card border border-accent/30 shadow-2xl rounded-2xl p-4 w-80 flex flex-col gap-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex flex-col items-center justify-center shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-accent animate-pulse"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h4 className="text-sm font-black text-text uppercase tracking-tight">
              Nova Atualização!
            </h4>
            <span className="text-[10px] text-accent font-bold">
              v{updateInfo?.version || '...'} disponível
            </span>
          </div>
          <button
            onClick={handleClose}
            className="ml-auto p-1 text-text-muted hover:text-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {status === 'available' && (
           <p className="text-[11px] text-text-muted leading-relaxed">
             Uma nova versão da MomAI está disponível com melhorias e correções. Baixar agora?
           </p>
        )}

        {status === 'downloading' && (
          <div className="flex flex-col gap-2 mt-1">
             <div className="flex justify-between text-[10px] text-text font-bold">
                <span>Baixando atualização...</span>
                <span>{Math.round(progress)}%</span>
             </div>
             <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
             </div>
          </div>
        )}

        {status === 'ready' && (
          <p className="text-[11px] text-green-400 font-medium leading-relaxed">
             Download concluído! Reinicie o aplicativo para aplicar a nova versão.
          </p>
        )}

        {status === 'error' && (
          <p className="text-[11px] text-red-500 font-medium leading-relaxed">
             Erro ao baixar atualização. Tente novamente mais tarde.
          </p>
        )}

        <div className="pt-2">
          {status === 'available' && (
            <button
              onClick={handleDownload}
              className="w-full py-2 bg-accent text-white text-[11px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
            >
              Baixar em 2º plano
            </button>
          )}

          {status === 'ready' && (
            <button
              onClick={handleInstall}
              className="w-full py-2 bg-green-600 text-white text-[11px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-green-500/20"
            >
              Reiniciar e Atualizar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
