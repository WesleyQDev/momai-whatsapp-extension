import { useState, useEffect } from 'react'

interface SimpleReminder {
  id: number
  title: string
  scheduled_time: string
}

export default function RemindersSidebar() {
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
    const interval = setInterval(fetchActive, 10000)
    return () => clearInterval(interval)
  }, [])

  if (reminders.length === 0) return null

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-8 overflow-y-auto hidden lg:flex bg-white/[0.01]">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-black text-accent/40 uppercase tracking-[0.4em] mb-2">Próximos Compromissos</span>
            <div className="h-px w-12 bg-accent/20"></div>
        </div>
        
        <div className="flex flex-col gap-4">
            {reminders.map(r => {
            const time = new Date(r.scheduled_time)
            const isToday = new Date().toDateString() === time.toDateString()
            
            return (
                <div key={r.id} className="group relative">
                    {/* Glow effect on hover */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-indigo-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                    
                    <div className="relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex justify-between items-center backdrop-blur-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                                {r.title}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent/50 group-hover:bg-accent animate-pulse"></div>
                                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">
                                    {isToday ? 'Hoje' : time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <span className="text-xl font-light text-white/40 group-hover:text-accent transition-colors font-mono">
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