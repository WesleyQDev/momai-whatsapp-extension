import React, { useState } from 'react'
import icon from '../assets/icon.png'

interface TitleBarProps {
  onClearHistory?: () => void
  activeRoute?: string
}

export default function TitleBar({}: TitleBarProps) {
  const [showAbout, setShowAbout] = useState(false)

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
      className="h-8 bg-bg flex justify-between items-center select-none w-full border-b border-border relative z-[300]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-xs text-text-muted font-bold tracking-tight flex items-center gap-2">
        <img src={icon} alt="Icon" className="w-4 h-4" />
        MomAI v0.1-alpha
      </div>

      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => setShowAbout(true)}
          className="h-full w-11 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
          title="Sobre"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
        <button
          onClick={handleMinimize}
          className="h-full w-11 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M2 6h8" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-11 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="6" height="6" strokeWidth="1.2" rx="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-full w-11 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M3 3l6 6M9 3l-6 6" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showAbout && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-zoom-in relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:bg-white/5 hover:text-text transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col items-center p-6 text-center">
              <h2 className="text-lg font-black text-text uppercase tracking-wider">MomAI</h2>
              <p className="text-xs text-text-muted mt-1">v0.1-alpha</p>
              <p className="text-sm text-text-muted mt-4">Assistente pessoal inteligente</p>
              <p className="text-xs text-text-muted mt-4">Desenvolvido por</p>
              <p className="text-sm font-bold text-accent">WesleyQDev</p>
              <p className="text-[10px] text-text-muted mt-1">wesleyqdev@momai.app</p>
              <p className="text-[10px] text-text-muted/50 mt-4">© 2025-2026 MomAI. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
