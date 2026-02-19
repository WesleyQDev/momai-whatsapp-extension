import { JSX, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardDocumentIcon,
  SpeakerWaveIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface MessageContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCopy: () => void
  onSpeak: () => void
  onDelete: () => void
  onRetry?: () => void
  isUser: boolean
}

export default function MessageContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onSpeak,
  onDelete,
  onRetry,
  isUser
}: MessageContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Ajustar posição para não sair da tela
  const adjustedX = Math.min(x, window.innerWidth - 180)
  const adjustedY = Math.min(y, window.innerHeight - 200)

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-44 bg-card/95 backdrop-blur-xl border border-border/40 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ top: adjustedY, left: adjustedX }}
    >
      <div className="flex flex-col p-1.5">
        <button
          onClick={() => {
            onCopy()
            onClose()
          }}
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-accent/10 rounded-lg transition-colors group"
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-text-muted group-hover:text-accent" />
          <span>Copiar Texto</span>
        </button>

        {!isUser && (
          <button
            onClick={() => {
              onSpeak()
              onClose()
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-accent/10 rounded-lg transition-colors group"
          >
            <SpeakerWaveIcon className="w-4 h-4 text-text-muted group-hover:text-accent" />
            <span>Ouvir Mensagem</span>
          </button>
        )}

        {isUser && onRetry && (
          <button
            onClick={() => {
              onRetry()
              onClose()
            }}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-accent/10 rounded-lg transition-colors group"
          >
            <ArrowPathIcon className="w-4 h-4 text-text-muted group-hover:text-accent" />
            <span>Tentar Novamente</span>
          </button>
        )}

        <div className="h-px bg-border/20 my-1 mx-1" />

        <button
          onClick={() => {
            onDelete()
            onClose()
          }}
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors group"
        >
          <TrashIcon className="w-4 h-4 opacity-70 group-hover:opacity-100" />
          <span>Excluir</span>
        </button>
      </div>
    </div>
  )

  return createPortal(menu, document.body)
}
