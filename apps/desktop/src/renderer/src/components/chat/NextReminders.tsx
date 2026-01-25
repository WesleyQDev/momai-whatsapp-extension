import { useState, useEffect } from 'react'

interface SimpleReminder {
  id: number
  title: string
  scheduled_time: string
}

export default function NextReminders() {
  const [reminders, setReminders] = useState<SimpleReminder[]>([])

  const fetchActive = async () => {
    try {
      const response = await fetch('http://localhost:8000/reminders/active')
      const data = await response.json()
      setReminders(data)
    } catch (e) {
      console.error('Erro ao buscar próximos lembretes', e)
    }
  }

  useEffect(() => {
    fetchActive()
    const interval = setInterval(fetchActive, 10000) // Atualiza a cada 10s
    return () => clearInterval(interval)
  }, [])

  if (reminders.length === 0) return null

  return (
    <div className="px-4 py-2 border-b border-border bg-black/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></div>
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Próximos Agendamentos</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {reminders.map(r => (
          <div key={r.id} className="flex justify-between items-center text-xs group">
            <span className="text-text-muted truncate max-w-[180px] group-hover:text-text transition-colors">
              {r.title}
            </span>
            <span className="text-accent/70 font-mono text-[10px]">
              {new Date(r.scheduled_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
