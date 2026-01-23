import ReactMarkdown from 'react-markdown'
import FloatingCard from './floating/FloatingCard'
import { DynamicRenderer, UIComponent } from './DynamicRenderer'

interface GraphInterfaceProps {
  view: 'center' | 'side'
  content: string
  options?: string[]
  uiSchema?: UIComponent
  onOptionSelect: (option: string) => void
  onClose: () => void
}

export default function GraphInterface({
  view,
  content,
  options = [],
  uiSchema,
  onOptionSelect,
  onClose
}: GraphInterfaceProps) {
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
    <div className="flex flex-col gap-6">
      {/* Markdown Content */}
      <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-300">
        <ReactMarkdown
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-xl font-semibold text-white mb-4" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-lg font-medium text-white/90 mb-3 mt-4" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-md font-medium text-white/90 mb-2 mt-3" {...props} />
            ),
            p: ({ node, ...props }) => <p className="mb-3" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-4 space-y-1" {...props} />,
            li: ({ node, ...props }) => <li className="text-slate-300" {...props} />,
            strong: ({ node, ...props }) => (
              <strong className="text-white font-semibold" {...props} />
            ),
            code: ({ node, ...props }) => (
              <code
                className="bg-white/10 px-1 py-0.5 rounded text-xs font-mono text-accent"
                {...props}
              />
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
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl font-medium transition-all active:scale-95 shadow-lg ${
                option.toLowerCase() === 'sim' ||
                option.toLowerCase() === 'confirmar' ||
                option.toLowerCase() === 'yes'
                  ? 'bg-accent text-white hover:opacity-90 shadow-accent/20'
                  : option.toLowerCase() === 'não' ||
                      option.toLowerCase() === 'cancelar' ||
                      option.toLowerCase() === 'no'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-200'
                    : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              {option}
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
      <div className="w-[400px] h-full bg-[#0f172a]/95 border-l border-white/5 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Header Lateral */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20">
          <span className="text-xs font-bold text-accent uppercase tracking-wider">
            Painel Lateral
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {Content}
        </div>
      </div>
    )
  }

  return null
}
