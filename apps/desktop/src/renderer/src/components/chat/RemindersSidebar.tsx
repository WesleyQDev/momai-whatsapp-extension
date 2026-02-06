import { BellSlashIcon } from '@heroicons/react/24/outline'
import { useActiveReminders } from '../../hooks/useActiveReminders'

export default function RemindersSidebar() {
  const { reminders } = useActiveReminders()

  return (
    <div className="w-full h-full flex flex-col bg-bg/30">
      {/* Header Minimalista */}
      <div className="p-3 mb-1 flex items-center justify-between sticky top-0 z-10">
        <span className="text-xs font-bold text-text/50 uppercase tracking-widest pl-1">
          Agenda
        </span>
        {reminders.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 rounded-full bg-border/20 text-text/40">
            {reminders.length}
          </span>
        )}
      </div>

      {reminders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
          <BellSlashIcon className="w-8 h-8 text-text mb-2" />
          <p className="text-xs font-medium text-text">Vazio</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-0.5 pb-2">
          {reminders.map((r) => {
            const time = new Date(r.scheduled_time)
            const isToday = new Date().toDateString() === time.toDateString()
            const isTomorrow =
              new Date(new Date().setDate(new Date().getDate() + 1)).toDateString() ===
              time.toDateString()

            let dateLabel = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            if (isToday) dateLabel = 'Hoje'
            if (isTomorrow) dateLabel = 'Amanhã'

            return (
              <div
                key={r.id}
                className="group p-2.5 rounded hover:bg-card/40 transition-colors flex flex-col gap-1 cursor-default"
              >
                <span className="text-xs text-text/90 leading-snug font-medium">{r.title}</span>

                <div className="flex items-center justify-between text-[10px] text-text-muted mt-0.5">
                  <span className="opacity-50">{dateLabel}</span>
                  <span className="font-mono opacity-60 group-hover:text-accent group-hover:opacity-100 transition-colors">
                    {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
