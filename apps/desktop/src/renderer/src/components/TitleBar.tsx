import React from 'react'
import icon from '../assets/icon.png'

interface TitleBarProps {
  onOpenSettings?: () => void
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
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
    <div className="h-8 bg-bg flex justify-between items-center select-none w-full border-b border-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="px-3 text-xs text-text-muted font-medium flex items-center gap-2">
        <img src={icon} alt="Icon" className="w-4 h-4 opacity-70" />
        MomAI
      </div>
      <div className="flex h-full items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button 
          onClick={onOpenSettings}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer mr-2"
          title="Configurações"
        >
           <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <div className="h-4 w-px bg-white/10 mx-1"></div>
        <button
          onClick={handleMinimize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none" stroke="currentColor">
            <path d="M0 0.5H10" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="1.5" y="1.5" width="7" height="7" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-red-500/80 hover:text-white transition-colors border-none bg-transparent cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <path d="M1 1L9 9M9 1L1 9" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
