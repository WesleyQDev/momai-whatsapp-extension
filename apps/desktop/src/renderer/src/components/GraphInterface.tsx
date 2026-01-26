import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
      <div className="prose prose-sm max-w-none leading-relaxed text-text">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-xl font-semibold text-text mb-4" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-lg font-medium text-text/90 mb-3 mt-4" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-md font-medium text-text/90 mb-2 mt-3" {...props} />
            ),
            p: ({ node, ...props }) => <p className="mb-3" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-4 space-y-1" {...props} />,
            li: ({ node, ...props }) => <li className="text-text/80" {...props} />,
            strong: ({ node, ...props }) => (
              <strong className="text-text font-semibold" {...props} />
            ),
            code: ({ node, ...props }) => (
              <code
                className="bg-accent/10 px-1 py-0.5 rounded text-xs font-mono text-accent"
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
              <td className="px-3 py-2 text-sm text-text-muted border-b border-border/10" {...props} />
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
      <div className="w-full sm:w-[400px] md:w-[450px] h-full bg-card flex flex-col overflow-hidden animate-slide-in-right shadow-2xl z-50">
        {/* Header de Relatório */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/10 bg-bg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">
              SISTEMA MOMAI
            </span>
            <span className="text-sm font-semibold text-text/90">Análise e Relatório</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-text/5 text-text-muted hover:text-text transition-all border border-transparent hover:border-border/10"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content com Estilo Paper/Report */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-card">
          <div className="max-w-none prose prose-slate prose-headings:text-text prose-p:text-text/80 prose-strong:text-accent prose-code:text-accent prose-pre:bg-bg prose-pre:border prose-pre:border-border/10">
            {Content}
          </div>

          {/* Footer do Relatório */}
          <div className="mt-12 pt-6 border-t border-border/10 flex items-center justify-between opacity-30 italic text-[10px] text-text-muted">
            <span>Gerado automaticamente por MomAI</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}
