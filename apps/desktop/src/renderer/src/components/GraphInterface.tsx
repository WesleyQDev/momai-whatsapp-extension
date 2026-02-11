import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FloatingCard from './floating/FloatingCard'
import { DynamicRenderer, type UIComponent } from './DynamicRenderer'
import { useI18n } from '../i18n'

interface GraphInterfaceProps {
  view: 'center' | 'side'
  content: string
  options?: string[]
  optionsMap?: Record<string, string>
  uiSchema?: UIComponent
  onOptionSelect: (option: string) => void
  onClose: () => void
}

export default function GraphInterface({
  view,
  content,
  options = [],
  optionsMap = {},
  uiSchema,
  onOptionSelect,
  onClose
}: GraphInterfaceProps) {
  const { t, formatDate } = useI18n()
  const handleDynamicAction = (actionId: string, value: any) => {
    // Envia a ação de volta como uma mensagem estruturada (JSON string)
    // O backend precisará detectar que isso é um evento de UI
    const payload = JSON.stringify({ action: actionId, value })
    onOptionSelect(payload)
  }

  // Conteúdo Comum (Markdown + Botões OU Dynamic UI)
  const Content = uiSchema ? (
    <div className="animate-fade-in">
      <DynamicRenderer schema={uiSchema} onAction={handleDynamicAction} />
    </div>
  ) : (
    <div className="flex flex-col gap-10">
      {/* Markdown Content */}
      <div className="max-w-none leading-relaxed text-text/90">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-3xl font-black text-white mb-8 mt-2 tracking-tight" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2
                className="text-xl font-bold text-white/90 mb-4 mt-10 tracking-tight"
                {...props}
              />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-lg font-bold text-white/80 mb-3 mt-8 tracking-tight" {...props} />
            ),
            p: ({ node, ...props }) => <p className="mb-6 leading-relaxed" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-8 space-y-3" {...props} />,
            li: ({ node, ...props }) => (
              <li className="text-text/70 marker:text-accent/60" {...props} />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote
                className="border-l-4 border-accent bg-accent/5 px-6 py-4 my-8 italic text-white/80 rounded-r-lg"
                {...props}
              />
            ),
            strong: ({ node, ...props }) => <strong className="text-white font-bold" {...props} />,
            code: ({ node, ...props }) => (
              <code
                className="bg-accent/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-accent border border-accent/20"
                {...props}
              />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead className="border-b border-border/20" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th
                className="px-3 py-2 text-left text-[10px] font-black text-accent/70 uppercase tracking-widest"
                {...props}
              />
            ),
            td: ({ node, ...props }) => (
              <td
                className="px-3 py-2 text-sm text-text-muted border-b border-border/10"
                {...props}
              />
            ),
            tr: ({ node, ...props }) => (
              <tr className="hover:bg-text/5 transition-colors" {...props} />
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Options Buttons */}
      {options && options.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => onOptionSelect(option)}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg font-medium transition-all active:scale-95 shadow-lg ${
                option.toLowerCase() === 'sim' ||
                option.toLowerCase() === 'confirmar' ||
                option.toLowerCase() === 'yes'
                  ? 'bg-accent text-white hover:opacity-90 shadow-accent/20'
                  : option.toLowerCase() === 'não' ||
                      option.toLowerCase() === 'cancelar' ||
                      option.toLowerCase() === 'no'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20'
                    : 'border border-border/20 bg-card text-text-muted hover:bg-accent/5 hover:text-accent hover:border-accent/30'
              }`}
            >
              {optionsMap[option] || option}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // Renderização Condicional baseada na View
  if (view === 'center') {
    return <FloatingCard onClose={onClose}>{Content}</FloatingCard>
  }

  if (view === 'side') {
    return (
      <div className="flex flex-col h-full bg-transparent overflow-hidden">
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/10 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_rgba(var(--accent),0.5)] animate-pulse" />
            <span className="text-xs font-bold text-text/90 uppercase tracking-[0.2em]">
              {t('graphInterface.header')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-text/40 hover:text-white transition-all group"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="group-hover:scale-110 transition-transform"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Clean Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-8 py-10">
            <div className="max-w-none">{Content}</div>

            {/* Footer do Relatório */}
            <div className="mt-20 pt-8 border-t border-border/10 flex items-center justify-between opacity-30 italic text-[10px] text-text-muted">
              <span className="uppercase tracking-[0.3em] font-medium">
                {t('graphInterface.footer')}
              </span>
              <span>{formatDate(new Date())}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
