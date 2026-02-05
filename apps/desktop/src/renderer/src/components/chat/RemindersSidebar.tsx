import { useState, useEffect } from 'react'

interface SimpleReminder {
  id: number
  title: string
  scheduled_time: string
}

export default function RemindersSidebar() {
  const [reminders, setReminders] = useState<SimpleReminder[]>([])
  const [retryCount, setRetryCount] = useState(0)

  const fetchActive = async () => {
    try {
      const response = await fetch('http://localhost:8000/reminders/active')
      const data = await response.json()
      setReminders(data)
      setRetryCount(0) // Reset em caso de sucesso
    } catch (e) {
      // Suprimir erros durante os primeiros 10 segundos
      if (retryCount > 5) {
        console.error('Erro ao buscar próximos lembretes', e)
      }
      setRetryCount(prev => prev + 1)
    }
  }

  useEffect(() => {
    fetchActive() // Busca imediata ao montar
    const interval = setInterval(fetchActive, 10000) // Atualiza a cada 10s
    return () => clearInterval(interval)
  }, [])

  if (reminders.length === 0) return null

  return (
    <div className="w-full h-full flex flex-col items-center p-6 overflow-y-auto custom-scrollbar">
      <div className="w-full flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-black text-accent/40 uppercase tracking-[0.4em] mb-2">
            Próximos Compromissos
          </span>
          <div className="h-px w-12 bg-accent/20"></div>
        </div>

        <div className="flex flex-col gap-4">
          {reminders.map((r) => {
            const time = new Date(r.scheduled_time)
            const isToday = new Date().toDateString() === time.toDateString()

            return (
              <div key={r.id} className="group relative">
                {/* Glow effect on hover */}
                <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-accent/5 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>

                <div className="relative p-5 rounded-2xl bg-card border border-border hover:border-accent/40 transition-all flex justify-between items-center backdrop-blur-sm shadow-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-text group-hover:text-accent transition-colors">
                      {r.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                      <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">
                        {isToday
                          ? 'Hoje'
                          : time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xl font-light text-text-muted group-hover:text-accent transition-colors font-mono">
                      {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
