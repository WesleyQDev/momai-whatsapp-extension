import React from 'react'
import icon from '../assets/icon.png'
import { useI18n } from '../i18n'

interface TitleBarProps {
  onClearHistory?: () => void
  activeRoute?: string
}

export default function TitleBar({ onClearHistory, activeRoute }: TitleBarProps) {
  const { t } = useI18n()
  const handleMinimize = () => {
    window.api.minimize()
  }

  const handleMaximize = () => {
    window.api.maximize()
  }

  const handleClose = () => {
    window.api.close()
  }

  return (
    <div
      className="h-7 bg-bg flex justify-between items-center select-none w-full border-b border-border relative z-[300]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-[10px] text-text-muted font-bold tracking-tight flex items-center gap-2">
        <img src={icon} alt="Icon" className="w-3.5 h-3.5" />
        MomAI v0.1-alpha
      </div>

      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Clear History Button */}
        {activeRoute === '/' && onClearHistory && (
          <button
            onClick={() => onClearHistory()}
            title={t('titlebar.clearHistory')}
            className="h-full px-3 flex items-center justify-center text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-all border-none bg-transparent cursor-pointer group"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        )}

        <button
          onClick={handleMinimize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M2 6h8" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="6" height="6" strokeWidth="1.2" rx="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M3 3l6 6M9 3l-6 6" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
