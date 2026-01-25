import { useState, useEffect } from 'react'

interface ResourceStats {
  ram_mb: number
  cpu_percent: number
  vram_used_mb: number
  vram_total_mb: number
}

export default function ResourceFooter() {
  const [stats, setStats] = useState<ResourceStats>({
    ram_mb: 0,
    cpu_percent: 0,
    vram_used_mb: 0,
    vram_total_mb: 0
  })

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:8000/ws')
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'resource_usage') {
        setStats(msg.data)
      }
    }
    return () => ws.close()
  }, [])

  const formatSize = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb.toFixed(0)} MB`
  }

  return (
    <footer className="h-6 bg-black/40 border-t border-white/5 flex items-center justify-between px-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 group">
          <span className="text-[9px] font-black text-text-muted/40 uppercase tracking-widest group-hover:text-accent transition-colors">
            MomAI Core Active
          </span>
          <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* CPU */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-black text-text-muted/40 uppercase tracking-widest">
            CPU
          </span>
          <span className="text-[9px] font-mono text-text-muted font-bold">
            {stats.cpu_percent.toFixed(0)}%
          </span>
        </div>

        {/* RAM */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-black text-text-muted/40 uppercase tracking-widest">
            RAM
          </span>
          <span className="text-[9px] font-mono text-text-muted font-bold">
            {formatSize(stats.ram_mb)}
          </span>
        </div>

        {/* VRAM (GPU) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-black text-text-muted/40 uppercase tracking-widest">
            VRAM
          </span>
          <span className="text-[9px] font-mono text-text-muted font-bold">
            {formatSize(stats.vram_used_mb)} <span className="text-[8px] opacity-30">/</span>{' '}
            {formatSize(stats.vram_total_mb)}
          </span>
        </div>
      </div>
    </footer>
  )
}
