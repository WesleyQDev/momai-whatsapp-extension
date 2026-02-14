import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import {
  fetchReminders as fetchRemindersApi,
  createReminder,
  updateReminder,
  deleteReminder,
  type Reminder
} from '../services/api'
import { useI18n } from '../i18n'
import { getOccurrenceForDate } from '../utils/reminders'

type RepeatInterval = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | null
type ViewMode = 'month' | 'week'

interface ReminderFormData {
  id?: number
  title: string
  content: string
  scheduled_time: string
  repeat_interval: RepeatInterval
  repeat_value: number
}

// --- Helper Functions ---

const getLocalISOString = (date = new Date()) => {
  const tzOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16)
}

const diffInDays = (d1: Date, d2: Date) => {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime()
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime()
  return Math.floor((t1 - t2) / (1000 * 60 * 60 * 24))
}

const isSameDay = (d1: Date, d2: Date) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

const getRecurrenceMeta = (interval: string | null) => {
  if (!interval) return null
  return interval === 'minutes' || interval === 'hours' ? 'intraday' : 'multiday'
}

const diffInMonths = (d1: Date, d2: Date) => {
  return (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth())
}

// --- Main Component ---

export default function RemindersView() {
  const { t, formatDate, formatTime } = useI18n()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const hourGridRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState<ReminderFormData>({
    title: '',
    content: '',
    scheduled_time: getLocalISOString(new Date(Date.now() + 3600000)),
    repeat_interval: null,
    repeat_value: 1
  })

  const fetchReminders = async () => {
    try {
      const data = await fetchRemindersApi()
      if (Array.isArray(data)) setReminders(data)
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error)
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [])

  // Scroll to current hour on week view load
  useEffect(() => {
    if (viewMode === 'week' && hourGridRef.current) {
      const hour = new Date().getHours()
      hourGridRef.current.scrollTop = hour * 60 - 100
    }
  }, [viewMode])

  const remindersMap = useMemo(() => {
    const map = new Map<string, Reminder[]>()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const horizonStart = new Date(year, month - 1, 1)
    const horizonEnd = new Date(year, month + 2, 0)
    const now = new Date()

    reminders.forEach((r) => {
      const start = new Date(r.scheduled_time)
      const interval = r.repeat_interval
      const value = r.repeat_value || 1

      if (!interval) {
        if (start >= horizonStart && start <= horizonEnd) {
          const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
          if (!map.has(key)) map.set(key, [])
          map.get(key)?.push(r)
        }
        return
      }

      for (let d = new Date(horizonStart); d <= horizonEnd; d.setDate(d.getDate() + 1)) {
        const startDayOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        if (d < startDayOnly) continue

        let isMatch = false
        if (interval === 'minutes' || interval === 'hours') {
          isMatch = !!getOccurrenceForDate(r, d, now)
        }
        else if (interval === 'days') isMatch = diffInDays(d, start) % value === 0
        else if (interval === 'weeks') isMatch = diffInDays(d, start) % (7 * value) === 0
        else if (interval === 'months') {
          isMatch = d.getDate() === start.getDate() && diffInMonths(d, start) % value === 0
        }

        if (isMatch) {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          if (!map.has(key)) map.set(key, [])
          map.get(key)?.push(r)
        }
      }
    })
    return map
  }, [reminders, currentDate])

  const monthData = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const days: any[] = []
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = firstDay - 1; i >= 0; i--) days.push({ d: new Date(year, month - 1, prevMonthDays - i), curr: false })
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) days.push({ d: new Date(year, month, i), curr: true })
    while (days.length < 35) days.push({ d: new Date(year, month + 1, days.length - (firstDay + new Date(year, month + 1, 0).getDate()) + 1), curr: false })
    return days
  }, [currentDate])

  const weekData = useMemo(() => {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [currentDate])

  const handlePrev = () => {
    const d = new Date(currentDate)
    viewMode === 'month' ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7)
    setCurrentDate(d)
  }

  const handleNext = () => {
    const d = new Date(currentDate)
    viewMode === 'month' ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7)
    setCurrentDate(d)
  }

  const handleOpenCreate = (date: Date, hour = 9) => {
    const d = new Date(date)
    d.setHours(hour, 0, 0, 0)
    setFormData({ title: '', content: '', scheduled_time: getLocalISOString(d), repeat_interval: null, repeat_value: 1 })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (reminder: Reminder) => {
    setFormData({
      id: reminder.id,
      title: reminder.title,
      content: reminder.content || '',
      scheduled_time: getLocalISOString(new Date(reminder.scheduled_time)),
      repeat_interval: reminder.repeat_interval as RepeatInterval,
      repeat_value: reminder.repeat_value || 1
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('reminders.deleteConfirm'))) {
      await deleteReminder(id)
      setReminders(prev => prev.filter(r => r.id !== id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...formData, scheduled_time: new Date(formData.scheduled_time).toISOString() }
    formData.id ? await updateReminder(formData.id, payload) : await createReminder(payload)
    setIsModalOpen(false)
    fetchReminders()
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="flex h-full w-full bg-bg text-text font-sans overflow-hidden transition-colors duration-300">
      {/* Sidebar - Compact list of selected day */}
      <aside className="w-64 border-r border-border/5 bg-sidebar flex flex-col shrink-0">
        <div className="p-4 border-b border-border/5">
          <h2 className="text-xs font-bold text-accent uppercase tracking-tighter mb-1">
            {formatDate(selectedDate, { weekday: 'short' }).replace('.', '')}
          </h2>
          <div className="text-3xl font-bold tracking-tight">
            {selectedDate.getDate()} {formatDate(selectedDate, { month: 'short' })}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {(remindersMap.get(`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`) || [])
            .sort((a, b) => {
              const now = new Date()
              const aTime = getOccurrenceForDate(a, selectedDate, now)?.getTime() ?? new Date(a.scheduled_time).getTime()
              const bTime = getOccurrenceForDate(b, selectedDate, now)?.getTime() ?? new Date(b.scheduled_time).getTime()
              return aTime - bTime
            })
            .map(r => {
              const isIntraday = getRecurrenceMeta(r.repeat_interval) === 'intraday';
              const now = new Date()
              const occurrence = getOccurrenceForDate(r, selectedDate, now) || new Date(r.scheduled_time)
              return (
                <div key={r.id} onClick={() => handleOpenEdit(r)} 
                  className={`p-2 rounded cursor-pointer group transition-colors border ${
                    isIntraday 
                      ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40' 
                      : 'hover:bg-accent/5 border-transparent hover:border-border/10'
                  }`}>
                  <div className="flex justify-between items-start">
                    <span className={`text-[11px] font-mono font-bold opacity-60 ${isIntraday ? 'text-emerald-400' : 'text-accent/80'}`}>
                      {formatTime(occurrence, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className={`text-[12px] font-medium leading-tight truncate ${isIntraday ? 'text-emerald-50' : 'text-text'}`}>
                    {r.title}
                  </div>
                </div>
              );
            })
          }
        </div>

        <div className="p-3 border-t border-border/10">
           <button onClick={() => handleOpenCreate(selectedDate)} className="w-full py-3 bg-accent text-black rounded text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all">
             {t('reminders.newReminder')}
           </button>
        </div>
      </aside>

      {/* Main View */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-bg">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border/10 bg-bg/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span className="text-accent tracking-tighter uppercase font-black">Agenda</span>
              <span className="text-text-muted opacity-40">/</span>
              <span className="capitalize text-sm font-medium">{formatDate(currentDate, { month: 'long', year: 'numeric' })}</span>
            </h1>
            
            <div className="flex bg-input border border-border/10 rounded p-0.5">
              <button 
                onClick={() => setViewMode('month')}
                className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded transition-all ${viewMode === 'month' ? 'bg-border/10 text-accent' : 'text-text-muted hover:text-text'}`}>
                Mês
              </button>
              <button 
                onClick={() => setViewMode('week')}
                className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded transition-all ${viewMode === 'week' ? 'bg-border/10 text-accent' : 'text-text-muted hover:text-text'}`}>
                Semana
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }} className="px-4 py-1.5 border border-border/10 rounded text-[11px] uppercase font-bold text-text-muted hover:text-text hover:bg-accent/5">
              Hoje
            </button>
            <div className="flex border border-border/10 rounded overflow-hidden">
              <button onClick={handlePrev} className="p-2 hover:bg-accent/5 border-r border-border/10"><ChevronLeftIcon className="w-4 h-4" /></button>
              <button onClick={handleNext} className="p-2 hover:bg-accent/5"><ChevronRightIcon className="w-4 h-4" /></button>
            </div>
          </div>
        </header>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'month' ? (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-7 border-b border-border/5 bg-bg/50">
                {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(day => (
                  <div key={day} className="py-3 text-center text-[11px] font-bold uppercase text-text-muted/60 tracking-widest">{day}</div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 grid-rows-5">
                {monthData.map((cell, i) => {
                  const key = `${cell.d.getFullYear()}-${cell.d.getMonth()}-${cell.d.getDate()}`
                  const items = (remindersMap.get(key) || []).filter(r => getRecurrenceMeta(r.repeat_interval) !== 'intraday')
                  const isToday = isSameDay(cell.d, new Date())
                  return (
                    <div key={i} onClick={() => setSelectedDate(cell.d)} 
                      className={`border-r border-b border-border/10 p-1.5 flex flex-col gap-0.5 transition-colors cursor-pointer hover:bg-accent/5 ${!cell.curr ? 'opacity-30 bg-black/5' : ''} ${isSameDay(cell.d, selectedDate) ? 'bg-accent/5' : ''}`}>
                      <span className={`text-[11px] font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted'}`}>
                        {cell.d.getDate()}
                      </span>
                      <div className="flex flex-col gap-px overflow-hidden">
                        {items.slice(0, 4).map(r => (
                          <div key={r.id} className="flex items-center gap-1 overflow-hidden">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"></span>
                            <span className="text-[10px] truncate font-medium text-text-muted">{r.title}</span>
                          </div>
                        ))}
                        {items.length > 4 && <div className="text-[9px] font-bold text-text-muted/50 pl-2">+{items.length-4}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Time-Line Weekly View (Google Style) */
            <div className="flex-1 flex flex-col h-full">
              <div className="flex border-b border-border/5 shrink-0 bg-bg">
                <div className="w-14 border-r border-border/5"></div>
                <div className="flex-1 grid grid-cols-7">
                  {weekData.map((d, i) => (
                    <div key={i} className="py-3 text-center border-r border-border/5 flex flex-col items-center">
                      <span className="text-[10px] font-bold uppercase text-accent/40 mb-1">{formatDate(d, { weekday: 'short' }).replace('.', '')}</span>
                      <span className={`text-xl font-bold w-9 h-9 flex items-center justify-center rounded-full ${isSameDay(d, new Date()) ? 'bg-accent text-black' : ''}`}>
                        {d.getDate()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div ref={hourGridRef} className="flex-1 overflow-y-auto custom-scrollbar relative bg-bg">
                <div className="flex h-[1440px]"> {/* 24h * 60px */}
                  <div className="w-14 shrink-0 border-r border-border/5 bg-sidebar/50 z-10 sticky left-0">
                    {hours.map(h => (
                      <div key={h} className="h-[60px] text-[10px] text-right pr-2 pt-0.5 text-text-muted font-bold opacity-50">
                        {h}:00
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 grid grid-cols-7 relative border-l border-white/5">
                    {weekData.map((day, dIdx) => {
                      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
                      const items = remindersMap.get(key) || []
                      return (
                        <div key={dIdx} className="relative h-full border-r border-white/5 group hover:bg-accent/5 transition-colors"
                             onClick={() => handleOpenCreate(day)}>
                           {/* Horizontal Guideline */}
                           {hours.map(h => (
                             <div key={h} className="absolute w-full h-px bg-white/5 pointer-events-none" style={{ top: h * 60 }}></div>
                           ))}
                           
                           {/* Current time indicator */}
                           {isSameDay(day, new Date()) && (
                             <div 
                               className="absolute w-full h-0.5 bg-red-500 z-30 pointer-events-none"
                               style={{ top: new Date().getHours() * 60 + new Date().getMinutes() }}
                             />
                           )}
                           
                           {/* Reminders as small cards */}
                            {items.map(r => {
                              const now = new Date()
                              const occurrence = getOccurrenceForDate(r, day, now)
                              if (!occurrence) return null
                              const top = occurrence.getHours() * 60 + occurrence.getMinutes()
                              const isIntraday = getRecurrenceMeta(r.repeat_interval) === 'intraday'
                              return (
                                <div key={r.id} onClick={(e) => { e.stopPropagation(); handleOpenEdit(r); }}
                                  className={`absolute left-1 right-1 p-1.5 rounded-r shadow-lg cursor-pointer overflow-hidden group hover:brightness-125 transition-all z-20 border-l-2 ${
                                    isIntraday 
                                      ? 'bg-emerald-500/20 border-emerald-500' 
                                      : 'bg-accent/20 border-accent'
                                  }`}
                                  style={{ top, height: 44 }}>
                                    <div className={`text-[10px] font-black uppercase leading-none mb-0.5 opacity-60 ${isIntraday ? 'text-emerald-400' : 'text-accent'}`}>
                                      {formatTime(occurrence, { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className={`text-[11px] font-bold truncate ${isIntraday ? 'text-emerald-50' : 'text-text'}`}>{r.title}</div>
                                </div>
                              )
                            })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modern Compact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-sm bg-card border border-border/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="px-5 py-4 bg-accent/5 border-b border-border/10 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">
                {formData.id ? 'Editar Lembrete' : 'Novo Lembrete'}
              </h3>
            </div>

            <div className="p-5 space-y-4">
              <input required autoFocus type="text" placeholder="Título do evento" 
                className="w-full bg-input border border-border/10 rounded-lg px-4 py-3 text-sm font-medium outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all text-text placeholder:text-text-muted/30"
                value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
              <textarea rows={3} placeholder="Descrição (opcional)"
                className="w-full bg-input border border-border/10 rounded-lg px-4 py-3 text-[12px] outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all resize-none text-text placeholder:text-text-muted/30"
                value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} />
              
              <div className="space-y-3">
                <input required type="datetime-local" className="w-full bg-input border border-border/10 rounded-lg px-3 py-2.5 text-xs font-bold text-text outline-none focus:border-accent/50"
                  value={formData.scheduled_time} onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })} />
                
                <div className="grid grid-cols-3 gap-2">
                  <select className="col-span-2 bg-input border border-border/10 rounded-lg px-3 py-2.5 text-xs font-bold text-text outline-none focus:border-accent/50"
                    value={formData.repeat_interval || ''} onChange={(e) => setFormData({ ...formData, repeat_interval: (e.target.value || null) as any, repeat_value: e.target.value ? (formData.repeat_value || 1) : 1 })}>
                      <option value="">Não repetir</option>
                      <option value="minutes">Minutos</option>
                      <option value="hours">Horas</option>
                      <option value="days">Dias</option>
                      <option value="weeks">Semanas</option>
                      <option value="months">Meses</option>
                  </select>
                  {formData.repeat_interval && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-text-muted">a cada</span>
                      <input type="number" min="1" max="99" 
                        className="w-full bg-input border border-border/10 rounded-lg px-2 py-2.5 text-xs font-bold text-text outline-none focus:border-accent/50"
                        value={formData.repeat_value} onChange={(e) => setFormData({ ...formData, repeat_value: Math.max(1, parseInt(e.target.value) || 1) })} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-card/50 border-t border-border/10">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text uppercase transition-colors">Cancelar</button>
              <button type="submit" className="px-5 py-2 bg-accent text-white rounded-lg text-xs font-bold uppercase hover:brightness-110 shadow-lg shadow-accent/20 transition-all">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
