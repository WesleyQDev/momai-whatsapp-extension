import { useActiveReminders } from '../../hooks/useActiveReminders'
import { useI18n } from '../../i18n'
import { getNextOccurrence } from '../../utils/reminders'

export default function NextReminders() {
  const { reminders } = useActiveReminders()
  const { t, formatTime } = useI18n()

  if (reminders.length === 0) return null

  return (
    <div className="px-4 py-2 border-b border-border bg-black/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></div>
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
          {t('nextReminders.title')}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {reminders.map((r) => (
          <div key={r.id} className="flex justify-between items-center text-xs group">
            <span className="text-text-muted truncate max-w-[180px] group-hover:text-text transition-colors">
              {r.title}
            </span>
            <span className="text-accent/70 font-mono text-[10px]">
              {formatTime(getNextOccurrence(r), {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
