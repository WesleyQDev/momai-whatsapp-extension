import React from 'react'

interface FloatingCardProps {
  children: React.ReactNode
  title?: string
  onClose?: () => void
  width?: string
}

export default function FloatingCard({
  children,
  title,
  onClose,
  width = 'max-w-md'
}: FloatingCardProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full ${width} bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-zoom-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-sidebar/50">
            {title && (
              <h3 className="text-xs font-black text-text/80 uppercase tracking-widest">{title}</h3>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors"
                aria-label="Close"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
      {/* Click outside target */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  )
}
