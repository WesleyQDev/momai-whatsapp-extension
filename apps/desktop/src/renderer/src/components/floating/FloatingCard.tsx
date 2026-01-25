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
    <div className="fixed top-10 inset-x-0 bottom-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full ${width} bg-[#0f172a]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-zoom-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            {title && <h3 className="text-lg font-semibold text-white/90">{title}</h3>}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
