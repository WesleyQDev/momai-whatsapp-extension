interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string) => void
  onOpenSettings?: () => void
}

export default function LateralBar({ activeRoute, onNavigate, onOpenSettings }: LateralBarProps) {
  return (
    <div className="w-16 bg-bg border-r border-border flex flex-col justify-between py-4 z-50">
      <div className="flex flex-col items-center w-full gap-4">
        {/* Chat Icon */}
        <button
          onClick={() => onNavigate('/')}
          title="Conversas"
          className={`group relative w-10 h-10 bg-transparent border-none flex items-center justify-center transition-all rounded-xl hover:bg-accent/10 ${activeRoute === '/' ? 'text-accent bg-accent/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/' && (
            <div className="absolute -left-3 w-1 h-6 bg-accent rounded-r-full animate-fade-in" />
          )}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform group-hover:scale-110"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>

        {/* Reminders Icon */}
        <button
          onClick={() => onNavigate('/reminders')}
          title="Lembretes"
          className={`group relative w-10 h-10 bg-transparent border-none flex items-center justify-center transition-all rounded-xl hover:bg-accent/10 ${activeRoute === '/reminders' ? 'text-accent bg-accent/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/reminders' && (
            <div className="absolute -left-3 w-1 h-6 bg-accent rounded-r-full animate-fade-in" />
          )}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform group-hover:scale-110"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>

        {/* Extensions Icon */}
        <button
          onClick={() => onNavigate('/extensions')}
          title="Extensões"
          className={`group relative w-10 h-10 bg-transparent border-none flex items-center justify-center transition-all rounded-xl hover:bg-accent/10 ${activeRoute === '/extensions' ? 'text-accent bg-accent/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/extensions' && (
            <div className="absolute -left-3 w-1 h-6 bg-accent rounded-r-full animate-fade-in" />
          )}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform group-hover:scale-110"
          >
            <path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 1.2 4 3 0 1.3-1 2.3-3 3l.5 2c2.61-.7 5.67-1 8.5-1s5.89.3 8.5 1l.5-2c-2-1.2-3-2.3-3-3 0-1.8 2.14-2.5 4-3l-.5-2z" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <button
          onClick={onOpenSettings}
          title="Configurações do Sistema"
          className="w-10 h-10 bg-transparent border-none text-text-muted cursor-pointer flex items-center justify-center transition-all rounded-xl hover:bg-white/5 hover:text-text"
        >
          <svg
            width="20"
            height="20"
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
      </div>
    </div>
  )
}
