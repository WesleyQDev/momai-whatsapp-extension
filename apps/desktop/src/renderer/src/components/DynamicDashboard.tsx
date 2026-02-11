import { useState, useEffect, useMemo } from 'react'
import {
  RocketLaunchIcon,
  CubeTransparentIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  FolderOpenIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'
import { fetchHardwareStats, sendExtensionAction } from '../services/api'

interface DynamicDashboardProps {
  extensionId?: string
  schema?: any[]
  title?: string
  description?: string
}

export default function DynamicDashboard({
  extensionId,
  schema = [],
  title = 'Painel Dinâmico',
  description = 'Interface gerada automaticamente pela extensão'
}: DynamicDashboardProps) {
  const [data, setData] = useState<Record<string, any>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const hasSourceWidgets = useMemo(() => {
    return schema.some((widget) => !!widget.source)
  }, [schema])

  const fetchData = async () => {
    if (!hasSourceWidgets) return
    try {
      const result = await fetchHardwareStats()
      setData((prev) => ({ ...prev, ...result }))
    } catch (err) {
      console.error('Erro ao buscar stats:', err)
    }
  }

  useEffect(() => {
    fetchData()
    // Solicita o estado inicial da extensão (como a lista de apps)
    if (extensionId) {
      handleAction('get_initial_state')
    }
    if (hasSourceWidgets) {
      const interval = setInterval(fetchData, 3000)
      return () => clearInterval(interval)
    }
    return () => {}
  }, [hasSourceWidgets, extensionId])

  useEffect(() => {
    if (!status) return
    const timeout = setTimeout(() => setStatus(null), 4000)
    return () => clearTimeout(timeout)
  }, [status])

  const handleAction = async (action: string, payload: any = {}) => {
    if (!extensionId) return
    try {
      setIsRefreshing(true)
      const result = await sendExtensionAction(extensionId, action, payload)
      // If the action returns a new state/data, update it
      if (result && typeof result === 'object' && !result.status) {
        setData((prev) => ({ ...prev, ...result }))
      }
      if (result && typeof result === 'object') {
        if (result.data && typeof result.data === 'object') {
          setData((prev) => ({ ...prev, ...result.data }))
        }
        if (result.inputs && typeof result.inputs === 'object') {
          setInputs((prev) => ({ ...prev, ...result.inputs }))
        }
        if (result.status && result.message) {
          const type = result.status === 'error' ? 'error' : 'success'
          setStatus({ type, message: result.message })
        }
      }
      // Refresh general data
      fetchData()
    } catch (err) {
      console.error('Falha na ação da extensão:', err)
      setStatus({ type: 'error', message: 'Falha ao executar a acao.' })
    } finally {
      setIsRefreshing(false)
    }
  }

  const getGridColsClass = (columns: number | undefined) => {
    if (columns === 1) return 'grid-cols-1'
    if (columns === 3) return 'grid-cols-1 md:grid-cols-3'
    return 'grid-cols-1 md:grid-cols-2'
  }

  const getColSpanStyle = (colSpan?: number) => {
    if (!colSpan || colSpan <= 1) return undefined
    return { gridColumn: `span ${colSpan} / span ${colSpan}` }
  }

  const renderWidget = (widget: any, index: number) => {
    switch (widget.type) {
      case 'stat':
        const value = widget.source ? data[widget.source] : widget.value
        return (
          <div
            key={index}
            className="p-6 rounded-2xl bg-card border border-border/10 flex flex-col gap-2 shadow-sm hover:shadow-accent/10 transition-all"
          >
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
              {widget.label}
            </span>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-text">
                {value ?? '--'}
                {widget.unit}
              </span>
            </div>
            {widget.source && (
              <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-1000"
                  style={{ width: `${value}%` }}
                />
              </div>
            )}
          </div>
        )

      case 'button':
        return (
          <button
            key={index}
            disabled={isRefreshing}
            className="px-6 py-3 bg-accent/10 border border-accent/20 text-accent rounded-xl font-bold hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={getColSpanStyle(widget.colSpan)}
            onClick={() => {
              let payload = widget.payload || {}
              if (Array.isArray(widget.payloadFrom)) {
                const fromInputs: Record<string, string> = {}
                widget.payloadFrom.forEach((key: string) => {
                  fromInputs[key] = inputs[key] || ''
                })
                payload = { ...payload, ...fromInputs }
              }
              handleAction(widget.action, payload)
            }}
          >
            {widget.icon === 'rocket' && <RocketLaunchIcon className="w-5 h-5" />}
            {widget.icon === 'refresh' && (
              <ArrowPathIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            )}
            {widget.icon === 'edit' && <PencilSquareIcon className="w-5 h-5" />}
            {widget.icon === 'folder' && <FolderOpenIcon className="w-5 h-5" />}
            {widget.label}
          </button>
        )

      case 'input':
        const inputId = widget.id || `input-${index}`
        return (
          <div
            key={index}
            className="p-6 rounded-2xl bg-card border border-border/10 flex flex-col gap-4"
            style={getColSpanStyle(widget.colSpan)}
          >
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
              {widget.label}
            </label>
            <div className="flex gap-2">
              {widget.multiline ? (
                <textarea
                  placeholder={widget.placeholder || 'Digite algo...'}
                  className="flex-1 bg-bg border border-border/20 rounded-xl px-4 py-2 text-text focus:outline-none focus:border-accent/50 transition-all min-h-[96px]"
                  value={inputs[inputId] || ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [inputId]: e.target.value }))}
                />
              ) : (
                <input
                  type={widget.inputType || 'text'}
                  placeholder={widget.placeholder || 'Digite algo...'}
                  className="flex-1 bg-bg border border-border/20 rounded-xl px-4 py-2 text-text focus:outline-none focus:border-accent/50 transition-all"
                  value={inputs[inputId] || ''}
                  onChange={(e) => {
                    if (widget.inputType === 'file') {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      const fileValue = (file as any)?.path || file?.name || ''
                      setInputs((prev) => ({ ...prev, [inputId]: fileValue }))
                    } else {
                      setInputs((prev) => ({ ...prev, [inputId]: e.target.value }))
                    }
                  }}
                />
              )}
              {widget.action && (
                <button
                  disabled={isRefreshing}
                  className="p-2 bg-accent text-white rounded-xl hover:bg-accent-hover transition-all disabled:opacity-50"
                  onClick={() => {
                    const value = inputs[inputId] || ''
                    if (widget.required && !value.trim()) {
                      setStatus({ type: 'error', message: 'Preencha o campo obrigatorio.' })
                      return
                    }
                    handleAction(widget.action, { value })
                    setInputs((prev) => ({ ...prev, [inputId]: '' }))
                  }}
                >
                  <PlusIcon className="w-6 h-6" />
                </button>
              )}
            </div>
            {widget.helper && <span className="text-xs text-text-muted">{widget.helper}</span>}
          </div>
        )

      case 'select':
        const selectId = widget.id || `select-${index}`
        return (
          <div
            key={index}
            className="p-6 rounded-2xl bg-card border border-border/10 flex flex-col gap-4"
            style={getColSpanStyle(widget.colSpan)}
          >
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest">
              {widget.label}
            </label>
            <select
              className="bg-bg border border-border/20 rounded-xl px-4 py-2 text-text focus:outline-none focus:border-accent/50 transition-all"
              value={inputs[selectId] || widget.default || ''}
              onChange={(e) => {
                const value = e.target.value
                setInputs((prev) => ({ ...prev, [selectId]: value }))
                if (widget.action) handleAction(widget.action, { value })
              }}
            >
              {(widget.options || []).map((opt: any, i: number) => (
                <option key={i} value={opt.value ?? opt}>
                  {opt.label ?? opt}
                </option>
              ))}
            </select>
          </div>
        )

      case 'toggle':
        const toggleId = widget.id || `toggle-${index}`
        return (
          <div
            key={index}
            className="p-6 rounded-2xl bg-card border border-border/10 flex items-center justify-between gap-4"
            style={getColSpanStyle(widget.colSpan)}
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
                {widget.label}
              </span>
              {widget.helper && <span className="text-xs text-text-muted">{widget.helper}</span>}
            </div>
            <button
              className={`w-12 h-6 rounded-full flex items-center px-1 transition-all ${
                inputs[toggleId] === 'true' || widget.value ? 'bg-accent' : 'bg-white/10'
              }`}
              onClick={() => {
                const current = inputs[toggleId] === 'true' || widget.value
                const nextValue = (!current).toString()
                setInputs((prev) => ({ ...prev, [toggleId]: nextValue }))
                if (widget.action) handleAction(widget.action, { value: nextValue === 'true' })
              }}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white transition-all ${
                  inputs[toggleId] === 'true' || widget.value ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )

      case 'list':
        const listItems = (widget.source ? data[widget.source] : widget.items) || []
        return (
          <div
            key={index}
            className="col-span-full p-6 rounded-2xl bg-card border border-border/10 flex flex-col gap-4"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
                {widget.label}
              </span>
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-text-muted">
                {listItems.length} itens
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {listItems.map((item: any, i: number) => (
                <div
                  key={i}
                  className="group flex justify-between items-center p-3 bg-bg/50 border border-border/5 rounded-xl hover:border-accent/20 transition-all"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text">{item.name || item}</span>
                    {item.subtitle && (
                      <span className="text-xs text-text-muted">{item.subtitle}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(widget.actions || []).map((action: any, aIndex: number) => (
                      <button
                        key={aIndex}
                        className="px-2 py-1 text-xs rounded-lg border border-border/10 text-text-muted hover:text-text hover:border-accent/30 transition-all"
                        onClick={() =>
                          handleAction(action.action, {
                            ...(action.payload || {}),
                            id: item.id || i
                          })
                        }
                      >
                        {action.icon === 'rocket' && <RocketLaunchIcon className="w-4 h-4" />}
                        {action.icon === 'edit' && <PencilSquareIcon className="w-4 h-4" />}
                        {action.icon === 'folder' && <FolderOpenIcon className="w-4 h-4" />}
                        <span className="ml-1">{action.label}</span>
                      </button>
                    ))}
                    {widget.deleteAction && (
                      <button
                        className="p-2 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={() => handleAction(widget.deleteAction, { id: item.id || i })}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {listItems.length === 0 && (
                <div className="py-8 text-center text-text-muted italic text-xs opacity-50">
                  {widget.emptyText || 'Nenhum item na lista.'}
                </div>
              )}
            </div>
          </div>
        )

      case 'text':
        return (
          <div key={index} className="col-span-full py-4 border-b border-border/10">
            <h3 className="text-lg font-bold text-text">{widget.label}</h3>
            <p className="text-sm text-text-muted">{widget.content}</p>
          </div>
        )

      case 'section':
        return (
          <section
            key={index}
            className="col-span-full rounded-3xl bg-card border border-border/10 p-8"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-text">{widget.title}</h2>
              {widget.description && (
                <p className="text-sm text-text-muted mt-2">{widget.description}</p>
              )}
            </div>
            <div className={`grid ${getGridColsClass(widget.columns)} gap-4`}>
              {(widget.children || []).map(renderWidget)}
            </div>
          </section>
        )

      default:
        return (
          <div
            key={index}
            className="p-6 rounded-2xl bg-white/5 border border-dashed border-border flex items-center justify-center gap-3 text-text-muted"
          >
            <CubeTransparentIcon className="w-5 h-5" />
            Widget desconhecido: {widget.type}
          </div>
        )
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-bg overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl w-full mx-auto px-8 py-10">
        <header className="mb-10 space-y-3">
          <h1 className="text-4xl font-bold text-text tracking-tight">{title}</h1>
          <p className="text-text-muted text-base max-w-2xl">{description}</p>
        </header>

        {status && (
          <div
            className={`mb-8 rounded-2xl border px-4 py-3 flex items-center gap-3 ${
              status.type === 'error'
                ? 'border-red-500/20 bg-red-500/10 text-red-200'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {status.type === 'error' ? (
              <ExclamationCircleIcon className="w-5 h-5" />
            ) : (
              <CheckCircleIcon className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">{status.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schema.map(renderWidget)}
        </div>

        {schema.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 italic py-20">
            <CubeTransparentIcon className="w-16 h-16 mb-4" />
            <p>Nenhum componente definido no manifesto desta extensao.</p>
          </div>
        )}
      </div>
    </div>
  )
}
