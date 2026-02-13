import React from 'react'
import icon from '../assets/icon.png'

interface TitleBarProps {}

export default function TitleBar({}: TitleBarProps) {
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
    </div>
  )
}
