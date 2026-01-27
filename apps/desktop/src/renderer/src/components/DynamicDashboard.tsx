import { useState, useEffect } from 'react'
import { RocketLaunchIcon, CubeTransparentIcon } from '@heroicons/react/24/outline'

interface DynamicDashboardProps {
  extensionId?: string
  schema?: any[]
  title?: string
  description?: string
}

export default function DynamicDashboard({ 
  schema = [], 
  title = "Painel Dinâmico", 
  description = "Interface gerada automaticamente pela extensão" 
}: DynamicDashboardProps) {
  
  const [data, setData] = useState<Record<string, any>>({})

  // Busca de dados reais para componentes que precisam de 'source'
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:8000/extensions/hardware-stats')
        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error('Erro ao buscar stats de hardware:', err)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 2000)
    return () => clearInterval(interval)
  }, [])


  const renderWidget = (widget: any, index: number) => {
    switch (widget.type) {
      case 'stat':
        const value = widget.source ? data[widget.source] : widget.value
        return (
          <div key={index} className="p-6 rounded-2xl bg-card border border-border/10 flex flex-col gap-2 shadow-sm hover:shadow-accent/5 transition-all">
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">{widget.label}</span>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-text">{value ?? '--'}{widget.unit}</span>
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
            className="px-6 py-3 bg-accent/10 border border-accent/20 text-accent rounded-xl font-bold hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2"
            onClick={() => console.log('Action:', widget.action)}
          >
            {widget.icon === 'rocket' && <RocketLaunchIcon className="w-5 h-5" />}
            {widget.label}
          </button>
        )

      case 'text':
        return (
          <div key={index} className="col-span-full py-4 border-b border-border/10">
             <h3 className="text-lg font-bold text-text">{widget.label}</h3>
             <p className="text-sm text-text-muted">{widget.content}</p>
          </div>
        )

      default:
        return (
          <div key={index} className="p-6 rounded-2xl bg-white/5 border border-dashed border-border flex items-center justify-center gap-3 text-text-muted">
            <CubeTransparentIcon className="w-5 h-5" />
            Unknown widget: {widget.type}
          </div>
        )
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col p-10 bg-bg overflow-y-auto custom-scrollbar">
      <header className="mb-10 space-y-2">
        <h1 className="text-4xl font-bold text-text tracking-tight">{title}</h1>
        <p className="text-text-muted text-lg">{description}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {schema.map(renderWidget)}
      </div>

      {schema.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 italic py-20">
          <CubeTransparentIcon className="w-16 h-16 mb-4" />
          <p>Nenhum componente definido no manifesto desta extensão.</p>
        </div>
      )}
    </div>
  )
}
