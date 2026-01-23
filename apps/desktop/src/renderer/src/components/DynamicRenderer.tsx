import React, { useState } from 'react'

export type UIComponent = {
  type: 'container' | 'text' | 'button' | 'input' | 'image' | 'divider'
  props?: Record<string, any>
  children?: UIComponent[]
}

interface DynamicRendererProps {
  schema: UIComponent
  onAction: (actionId: string, value?: any) => void
}

export const DynamicRenderer: React.FC<DynamicRendererProps> = ({ schema, onAction }) => {
  const { type, props = {}, children } = schema
  const [inputValue, setInputValue] = useState(props.defaultValue || '')

  switch (type) {
    case 'container':
      return (
        <div 
          className={`flex ${props.direction === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-3'} ${props.className || ''} ${props.padding ? 'p-4' : ''} ${props.background ? 'bg-white/5 rounded-lg border border-white/5' : ''}`}
        >
          {children?.map((child, i) => (
            <DynamicRenderer key={i} schema={child} onAction={onAction} />
          ))}
        </div>
      )
    
    case 'text':
      return (
        <div className={`text-text ${props.variant === 'title' ? 'text-lg font-bold text-white mb-1' : props.variant === 'subtitle' ? 'text-sm font-semibold text-accent uppercase tracking-wide mb-2' : 'text-sm text-text-muted leading-relaxed'} ${props.className || ''}`}>
          {props.content}
        </div>
      )

    case 'input':
      return (
        <div className="flex flex-col gap-1.5 w-full">
          {props.label && <label className="text-xs font-medium text-text-muted ml-1">{props.label}</label>}
          <div className="flex gap-2">
            <input 
                type={props.inputType || 'text'}
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-white/20"
                placeholder={props.placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={() => onAction('input_blur', { id: props.id, value: inputValue })}
            />
             {/* Se tiver um botão de ação acoplado (ex: Pesquisar) */}
             {props.actionButton && (
                 <button
                    onClick={() => onAction(props.id, inputValue)}
                    className="bg-accent text-white px-3 rounded-lg hover:bg-accent/90"
                 >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                 </button>
             )}
          </div>
        </div>
      )

    case 'button':
      return (
        <button
          onClick={() => onAction(props.id || 'button_click', props.value)}
          className={`px-4 py-2.5 rounded-lg font-medium transition-all active:scale-95 text-sm ${
            props.variant === 'primary' 
              ? 'bg-accent text-white hover:brightness-110 shadow-lg shadow-accent/20' 
              : props.variant === 'danger'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
              : 'bg-white/5 text-text hover:bg-white/10 border border-white/5'
          } ${props.fullWidth ? 'w-full' : ''}`}
        >
          {props.label}
        </button>
      )
      
    case 'image':
        return (
            <img 
                src={props.src} 
                alt={props.alt} 
                className={`rounded-lg border border-white/10 ${props.className || ''}`} 
            />
        )

    case 'divider':
        return <div className="h-px bg-white/10 w-full my-2" />

    default:
      return <div className="text-red-400 text-xs bg-red-500/10 p-2 rounded border border-red-500/20">Componente desconhecido: {type}</div>
  }
}
