import { useState, useEffect } from 'react'
import { fetchExtensions } from '../services/api'
import {
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'

interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string) => void
  onOpenSettings?: () => void
  isCompact?: boolean
}

interface ExtensionItem {
  id: string
  name: string
  icon?: string
  enabled: boolean
  features: {
    sidebar?: boolean
    agent_name?: string
    ui_view?: string
    ui_schema?: any[]
  }
}

const iconMap: Record<string, any> = {
  Cpu: CpuChipIcon,
  MessageSquare: ChatBubbleLeftRightIcon,
  Calendar: CalendarIcon,
  Puzzle: PuzzlePieceIcon,
  Layout: GlobeAltIcon
}

export default function LateralBar({
  activeRoute,
  onNavigate,
  onOpenSettings,
  isCompact = false
}: LateralBarProps) {
  const { t } = useI18n()
  const [extensions, setExtensions] = useState<ExtensionItem[]>([])

  useEffect(() => {
    fetchExtensions().then((allExts) => {
      // Sort to ensure Chat is first
      const sorted = (allExts as any[]).sort((a, b) => {
        if (a.id.includes('responder')) return -1
        if (b.id.includes('responder')) return 1
        return 0
      })
      setExtensions(sorted.filter((e) => e.features?.sidebar && e.enabled))
    })

    const handleSync = (e: any) => {
      const allExts = e.detail as ExtensionItem[]
      const sorted = allExts.sort((a, b) => {
        if (a.id.includes('responder')) return -1
        if (b.id.includes('responder')) return 1
        return 0
      })
      setExtensions(sorted.filter((e) => e.features?.sidebar && (e as any).enabled))
    }
    window.addEventListener('momai_extensions_sync', handleSync)
    return () => window.removeEventListener('momai_extensions_sync', handleSync)
  }, [])

  return (
    <div
      className={`${isCompact ? 'w-12 py-2' : 'w-16 py-4'} bg-bg border-r border-border flex flex-col justify-between z-50 transition-all duration-300`}
    >
      <div
        className={`flex flex-col items-center w-full ${isCompact ? 'gap-2' : 'gap-4'} overflow-y-auto scrollbar-none`}
      >
        {/* All items are now dynamic and reordered */}
        {(() => {
          const chatIcon = extensions.find((e) => e.features.agent_name === 'responder')
          const agendaIcon = extensions.find((e) => e.features.agent_name === 'scheduler')
          const others = extensions.filter(
            (e) =>
              e.features.agent_name !== 'responder' && e.features.agent_name !== 'scheduler'
          )

          const renderExt = (ext: ExtensionItem) => {
            const IconComponent = iconMap[ext.icon || ''] || PuzzlePieceIcon
            const isChat = ext.features.agent_name === 'responder'
            const route = isChat ? '/' : `/extensions/${ext.id}`
            const isActive = isChat ? activeRoute === '/' : activeRoute === `/extensions/${ext.id}`

            return (
              <button
                key={ext.id}
                onClick={() => onNavigate(route)}
                title={ext.name}
                id={isChat ? 'tutorial-chat' : undefined}
                className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
              >
                {isActive && (
                  <div
                    className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
                  />
                )}
                <IconComponent
                  className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-transform group-hover:scale-110`}
                />
              </button>
            )
          }

          const renderNotes = () => (
            <button
              onClick={() => onNavigate('/notes')}
              title={t('sidebar.notes')}
              id="tutorial-notes"
              className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all hover:bg-accent/10 ${activeRoute === '/notes' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
            >
              {activeRoute === '/notes' && (
                <div
                  className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
                />
              )}
              <DocumentTextIcon
                className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-transform group-hover:scale-110`}
              />
            </button>
          )

          return (
            <>
              {chatIcon && renderExt(chatIcon)}
              {renderNotes()}
              {agendaIcon && renderExt(agendaIcon)}
              {others.map((ext) => renderExt(ext))}
            </>
          )
        })()}

        <div className="w-8 h-[1px] bg-border/30 my-2" />

        {/* Store Icon */}
        <button
          onClick={() => onNavigate('/extensions')}
          title={t('sidebar.store')}
          id="tutorial-store"
          className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all hover:bg-accent/10 ${activeRoute === '/extensions' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/extensions' && (
            <div
              className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`}
            />
          )}
          <PuzzlePieceIcon
            className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-transform group-hover:scale-110`}
          />
        </button>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <button
          onClick={onOpenSettings}
          title={t('sidebar.settings')}
          className={`${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} bg-transparent border-none text-text-muted cursor-pointer flex items-center justify-center transition-all hover:bg-white/5 hover:text-text`}
        >
          <Cog6ToothIcon className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </button>
      </div>
    </div>
  )
}
