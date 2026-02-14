import { BellSlashIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { useActiveReminders } from '../../hooks/useActiveReminders'
import { useI18n } from '../../i18n'
import { getNextOccurrence, getOccurrenceForDate } from '../../utils/reminders'

interface RemindersSidebarProps {
  onNavigate?: () => void
}

/**
 * Returns a human-readable recurrence badge label and a "category" color.
 *
 * Categories:
 *  - "intraday"  → repeats within the same day (minutes / hours)  – accent/green pulse
 *  - "multiday"  → repeats across days / weeks / months           – muted blue/purple
 *  - null        → one-shot, no recurrence
 */
function getRecurrenceMeta(
  t: (key: string, vars?: Record<string, string | number>) => string,
  interval: string | null,
  value: number | null
): { label: string; category: 'intraday' | 'multiday' } | null {
  if (!interval) return null
  const v = value || 1

  switch (interval) {
    case 'minutes':
      return {
        label: t('remindersSidebar.repeat.minutes', { value: v }),
        category: 'intraday'
      }
    case 'hours':
      return {
        label: t('remindersSidebar.repeat.hours', { value: v }),
        category: 'intraday'
      }
    case 'days':
      return {
        label: t('remindersSidebar.repeat.days', { value: v }),
        category: 'multiday'
      }
    case 'weeks':
      return {
        label: t('remindersSidebar.repeat.weeks', { value: v }),
        category: 'multiday'
      }
    case 'months':
      return {
        label: t('remindersSidebar.repeat.months', { value: v }),
        category: 'multiday'
      }
    default:
      return null
  }
}

export default function RemindersSidebar({ onNavigate }: RemindersSidebarProps) {
  const { reminders } = useActiveReminders()
  const { t, formatTime } = useI18n()

  const today = new Date()
  const todayReminders = reminders
    .filter(r => {
      const occurrence = getOccurrenceForDate(r, today, today)
      return occurrence !== null
    })
    .slice(0, 4)

  return (
    <div className="w-full h-full flex flex-col bg-bg/30" id="tutorial-agenda">
      {/* Header */}
      <div className="p-3 mb-1 flex items-center justify-between sticky top-0 z-10">
        <span className="text-xs font-bold text-text/50 uppercase tracking-widest pl-1">
          {t('remindersSidebar.today')}
        </span>
        {todayReminders.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 rounded-full bg-border/20 text-text/40">
            {todayReminders.length}
          </span>
        )}
      </div>

      {todayReminders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
          <BellSlashIcon className="w-8 h-8 text-text mb-2" />
          <p className="text-xs font-medium text-text">{t('remindersSidebar.empty')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-0.5 pb-2">
          {todayReminders.map((r) => {
            const time = getOccurrenceForDate(r, today, today) || getNextOccurrence(r)
            const recurrence = getRecurrenceMeta(t, r.repeat_interval, r.repeat_value)

            return (
              <div
                key={r.id}
                className="group p-2.5 rounded hover:bg-card/40 transition-colors flex flex-col gap-1 cursor-default"
              >
                <span className="text-xs text-text/90 leading-snug font-medium">{r.title}</span>

                <div className="flex items-center justify-between text-[10px] text-text-muted mt-0.5">
                  <span className="opacity-50">Hoje</span>
                  <span className="font-mono opacity-60 group-hover:text-accent group-hover:opacity-100 transition-colors">
                    {formatTime(time, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Recurrence badge */}
                {recurrence && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {recurrence.category === 'intraday' ? (
                      <>
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400/90">
                          {recurrence.label}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-2.5 h-2.5 text-violet-400/80"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-violet-400/80">
                          {recurrence.label}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {todayReminders.length > 0 && onNavigate && (
        <div className="p-3 border-t border-border/10">
          <button 
            onClick={onNavigate}
            className="w-full py-2 flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <CalendarIcon className="w-4 h-4" />
            Ver Agenda
          </button>
        </div>
      )}
    </div>
  )
}
