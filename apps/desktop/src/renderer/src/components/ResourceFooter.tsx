import React, { useState, useEffect, useMemo } from 'react'

interface ResourceStats {
  ram_mb: number
  vram_used_mb: number
  vram_total_mb: number
  context_used_tokens: number
  context_total_tokens: number
}

const parseNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const formatSize = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb > 0) return `${mb.toFixed(0)} MB`
  return '0 MB'
}

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return `${tokens}`
}

function MiniBar({ percent, color }: { percent: number; color: string }): React.JSX.Element {
  return (
    <div className="w-[40px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${Math.min(Math.max(percent, 0), 100)}%`,
          backgroundColor: color
        }}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  percent,
  color
}: {
  label: string
  value: string
  sub?: string
  percent?: number
  color: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 group/metric">
      <span className="text-[8px] font-bold text-text-muted/30 uppercase tracking-[0.12em] group-hover/metric:text-text-muted/50 transition-colors">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-text-muted/80 font-semibold tabular-nums">
          {value}
        </span>
        {sub && <span className="text-[8px] font-mono text-text-muted/25 font-medium">{sub}</span>}
      </div>
      {percent !== undefined && <MiniBar percent={percent} color={color} />}
    </div>
  )
}

export default function ResourceFooter(): React.JSX.Element {
  const [stats, setStats] = useState<ResourceStats>({
    ram_mb: 0,
    vram_used_mb: 0,
    vram_total_mb: 0,
    context_used_tokens: 0,
    context_total_tokens: 0
  })
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    let isBooting = true

    const bootTimeout = setTimeout(() => {
      isBooting = false
    }, 15000)

    const connect = (): void => {
      try {
        ws = new WebSocket('ws://127.0.0.1:8000/ws')

        ws.onopen = () => {
          setConnected(true)
          reconnectAttempts = 0
        }

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data)
          if (msg.type === 'resource_usage') {
            setStats((prev) => {
              const next: ResourceStats = {
                ram_mb: parseNumber(msg.data?.ram_mb, prev.ram_mb),
                vram_used_mb: parseNumber(msg.data?.vram_used_mb, prev.vram_used_mb),
                vram_total_mb: parseNumber(msg.data?.vram_total_mb, prev.vram_total_mb),
                context_used_tokens: parseNumber(
                  msg.data?.context_used_tokens,
                  prev.context_used_tokens
                ),
                context_total_tokens: parseNumber(
                  msg.data?.context_total_tokens,
                  prev.context_total_tokens
                )
              }

              if (next.vram_total_mb <= 0 && prev.vram_total_mb > 0) {
                next.vram_total_mb = prev.vram_total_mb
              }

              return next
            })
          }
        }

        ws.onclose = () => {
          setConnected(false)
          if (!isBooting && reconnectAttempts < 10) {
            reconnectAttempts++
            const delay = Math.min(2000 * reconnectAttempts, 10000)
            reconnectTimeout = setTimeout(connect, delay)
          }
        }

        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        // Silent fail during boot
      }
    }

    const initialDelay = setTimeout(connect, 3000)

    return () => {
      clearTimeout(bootTimeout)
      clearTimeout(initialDelay)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      ws?.close()
    }
  }, [])

  const derived = useMemo(() => {
    const vramPercent =
      stats.vram_total_mb > 0 ? (stats.vram_used_mb / stats.vram_total_mb) * 100 : 0

    const ctxPercent =
      stats.context_total_tokens > 0
        ? (stats.context_used_tokens / stats.context_total_tokens) * 100
        : 0

    const getColor = (pct: number): string => {
      if (pct > 85) return '#ef4444'
      if (pct > 60) return '#f59e0b'
      return '#8b5cf6'
    }

    return { vramPercent, ctxPercent, getColor }
  }, [stats])

  return (
    <footer className="h-7 bg-black/30 backdrop-blur-sm border-t border-white/[0.04] flex items-center justify-between px-4 select-none relative z-[300]">
      {/* Left: status */}
      <div className="flex items-center gap-2">
        <div
          className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
            connected ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]' : 'bg-red-400/60'
          }`}
        />
        <span className="text-[9px] font-semibold text-text-muted/35 tracking-wide">
          {connected ? 'Core' : 'Offline'}
        </span>
      </div>

      {/* Right: metrics */}
      <div className="flex items-center gap-5">
        {/* RAM — total consumption by MomAI processes */}
        <Metric label="RAM" value={formatSize(stats.ram_mb)} color="#8b5cf6" />

        {/* Separator */}
        <div className="w-px h-3 bg-white/[0.06]" />

        {/* VRAM — llama.cpp internal GPU memory */}
        <Metric
          label="VRAM"
          value={stats.vram_total_mb > 0 ? `${formatSize(stats.vram_used_mb)}` : '—'}
          sub={stats.vram_total_mb > 0 ? `/ ${formatSize(stats.vram_total_mb)}` : undefined}
          percent={stats.vram_total_mb > 0 ? derived.vramPercent : undefined}
          color={derived.getColor(derived.vramPercent)}
        />

        {/* Separator */}
        <div className="w-px h-3 bg-white/[0.06]" />

        {/* Context — tokens used / total */}
        <Metric
          label="CTX"
          value={
            stats.context_total_tokens > 0 ? `${formatTokens(stats.context_used_tokens)}` : '—'
          }
          sub={
            stats.context_total_tokens > 0
              ? `/ ${formatTokens(stats.context_total_tokens)}`
              : undefined
          }
          percent={stats.context_total_tokens > 0 ? derived.ctxPercent : undefined}
          color={derived.getColor(derived.ctxPercent)}
        />
      </div>
    </footer>
  )
}
