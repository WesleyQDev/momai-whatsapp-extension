import { useState, useEffect } from 'react'
import { fetchExtensions } from '../services/api'
import {
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'

interface LateralBarProps {
  activeRoute: string
  onNavigate: (path: string) => void
  onOpenSettings?: () => void
}

interface ExtensionItem {
  id: string
  name: string
  icon?: string
  features: {
    sidebar?: boolean
    agent_name?: string
  }
}



const iconMap:Record<string, any> = {
  Cpu: CpuChipIcon,
  MessageSquare: ChatBubbleLeftRightIcon,
  Calendar: CalendarIcon,
  Puzzle: PuzzlePieceIcon,
  Layout: GlobeAltIcon
}

export default function LateralBar({ activeRoute, onNavigate, onOpenSettings }: LateralBarProps) {
  const [extensions, setExtensions] = useState<ExtensionItem[]>([])

  useEffect(() => {
    fetchExtensions().then((allExts) => {
      // Sort to ensure Chat is first
      const sorted = (allExts as any[]).sort((a, b) => {
        if (a.id.includes('responder')) return -1;
        if (b.id.includes('responder')) return 1;
        return 0;
      });
      setExtensions(sorted.filter(e => e.features?.sidebar));
    });

    const handleSync = (e: any) => {
       const allExts = e.detail as ExtensionItem[]
       const sorted = allExts.sort((a, b) => {
        if (a.id.includes('responder')) return -1;
        if (b.id.includes('responder')) return 1;
        return 0;
      });
       setExtensions(sorted.filter(e => e.features?.sidebar))
    }
    window.addEventListener('momai_extensions_sync', handleSync)
    return () => window.removeEventListener('momai_extensions_sync', handleSync)
  }, [])

  return (
    <div className="w-16 bg-bg border-r border-border flex flex-col justify-between py-4 z-50">
      <div className="flex flex-col items-center w-full gap-4 overflow-y-auto scrollbar-none">
        {/* All items are now dynamic */}
        {extensions.map((ext) => {
          const IconComponent = iconMap[ext.icon || ''] || PuzzlePieceIcon
          const isChat = ext.features.agent_name === 'responder'
          const route = isChat ? '/' : `/extensions/${ext.id}`
          const isActive = isChat ? activeRoute === '/' : activeRoute === `/extensions/${ext.id}`


          return (
            <button
              key={ext.id}
              onClick={() => onNavigate(route)}
              title={ext.name}
              className={`group relative w-10 h-10 shrink-0 bg-transparent border-none flex items-center justify-center transition-all rounded-xl hover:bg-accent/10 ${isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
            >
              {isActive && (
                <div className="absolute -left-3 w-1 h-6 bg-accent rounded-r-full animate-fade-in" />
              )}
              <IconComponent className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>
          )
        })}

        <div className="w-8 h-[1px] bg-border/30 my-2" />

        {/* Store Icon */}
        <button
          onClick={() => onNavigate('/extensions')}
          title="Loja de Extensões"
          className={`group relative w-10 h-10 shrink-0 bg-transparent border-none flex items-center justify-center transition-all rounded-xl hover:bg-accent/10 ${activeRoute === '/extensions' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
        >
          {activeRoute === '/extensions' && (
            <div className="absolute -left-3 w-1 h-6 bg-accent rounded-r-full animate-fade-in" />
          )}
          <PuzzlePieceIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <button
          onClick={onOpenSettings}
          title="Configurações"
          className="w-10 h-10 bg-transparent border-none text-text-muted cursor-pointer flex items-center justify-center transition-all rounded-xl hover:bg-white/5 hover:text-text"
        >
          <Cog6ToothIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
