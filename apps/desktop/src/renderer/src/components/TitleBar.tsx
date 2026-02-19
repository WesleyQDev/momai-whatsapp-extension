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
        MomAI
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
          <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-zoom-in relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:bg-white/5 hover:text-text transition-colors z-10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            
            {/* Header */}
            <div className="flex flex-col items-center p-6 text-center border-b border-border">
              <h2 className="text-lg font-black text-text uppercase tracking-wider">MomAI</h2>
              <p className="text-xs text-text-muted mt-1">v0.1-alpha</p>
              <p className="text-sm text-text-muted mt-4">Assistente pessoal inteligente</p>
              <p className="text-xs text-text-muted mt-4">Desenvolvido por</p>
              <p className="text-sm font-bold text-accent">Wesley Developer Studios</p>
              <p className="text-[10px] text-text-muted/50 mt-4">© 2025-2026 MomAI. Todos os direitos reservados.</p>
            </div>

            {/* Contato */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-text mb-4 text-center">Fale Conosco</h3>
              <p className="text-xs text-text-muted text-center mb-4">Estamos aqui para ajudar! Entre em contato pela plataforma que preferir.</p>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Email */}
                <a 
                  href="mailto:wesleyqueirozdeveloper@gmail.com" 
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">Email</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">wesleyqueirozdeveloper@gmail.com</p>
                </a>

                {/* GitHub */}
                <a 
                  href="https://github.com/Wesley-Developer-Studios" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">GitHub</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">Wesley Developer Studios</p>
                </a>

                {/* YouTube */}
                <a 
                  href="https://www.youtube.com/@WesleyDev" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">YouTube</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">@WesleyDev</p>
                </a>

                {/* Repositório */}
                <a 
                  href="https://github.com/WesleyQDev/MomAI" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center p-3 bg-bg border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-2 group-hover:bg-accent/20 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-text">Repositório</h4>
                  <p className="text-[10px] text-text-muted text-center mt-1">github.com/WesleyQDev/MomAI</p>
                </a>
              </div>

              {/* Outras dúvidas */}
              <div className="border-t border-border pt-4 text-center">
                <h4 className="text-xs font-bold text-text mb-1">Outras dúvidas?</h4>
                <p className="text-[10px] text-text-muted mb-3">Para questões, sugestões ou relatórios de bugs, abra uma issue no GitHub.</p>
                <a 
                  href="https://github.com/WesleyQDev/MomAI/issues" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Abrir Issue no GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
