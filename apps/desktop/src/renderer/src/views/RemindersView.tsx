import { useState, useEffect } from 'react'

interface Reminder {
  id: number
  title: string
  content: string
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  is_active: boolean
}

export default function RemindersView() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReminders = async () => {
    try {
      console.log('Buscando lembretes...')
      const response = await fetch('http://localhost:8000/reminders')
      const data = await response.json()
      console.log('Lembretes recebidos:', data)
      if (Array.isArray(data)) {
        setReminders(data)
      } else {
        console.error('Dados recebidos não são uma lista:', data)
        setReminders([])
      }
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteReminder = async (id: number) => {
    try {
      await fetch(`http://localhost:8000/reminders/${id}`, { method: 'DELETE' })
      setReminders(reminders.filter((r) => r.id !== id))
    } catch (error) {
      console.error('Erro ao deletar lembrete:', error)
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [])

  return (
    <div className="flex-1 flex flex-col p-8 bg-bg overflow-y-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Lembretes</h1>
          <p className="text-text-muted text-sm">Gerencie seus agendamentos e tarefas</p>
        </div>
        <button 
           onClick={fetchReminders}
           className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : reminders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
             </svg>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Nenhum lembrete</h3>
          <p className="text-text-muted max-w-xs">Peça para a MomAI agendar algo como: "Me lembre de beber água a cada 2 horas".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map((reminder) => (
            <div 
              key={reminder.id}
              className={`p-5 rounded-2xl border transition-all bg-white/5 ${reminder.is_active ? 'border-accent/40 shadow-lg shadow-accent/5' : 'border-white/10 opacity-80'}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${reminder.is_active ? 'bg-accent animate-pulse' : 'bg-text-muted'}`}></div>
                   <h3 className={`font-bold ${reminder.is_active ? 'text-white' : 'text-text-muted'}`}>{reminder.title}</h3>
                </div>
                <button 
                  onClick={() => deleteReminder(reminder.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              
              <p className="text-sm text-text-muted mb-4 line-clamp-2">{reminder.content || 'Sem descrição'}</p>
              
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2 text-accent">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                   </svg>
                   <span>{new Date(reminder.scheduled_time).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                </div>
                
                {reminder.repeat_interval && (
                  <div className="px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20">
                     Repete a cada {reminder.repeat_value} {reminder.repeat_interval}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
