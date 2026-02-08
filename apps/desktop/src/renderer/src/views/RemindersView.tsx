import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import {
  fetchReminders as fetchRemindersApi,
  createReminder,
  updateReminder,
  deleteReminder,
  type Reminder
} from '../services/api'

type RepeatInterval = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | null

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

const isSameDay = (d1: Date, d2: Date) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

const translateInterval = (interval: string | null, value: number | null) => {
  if (!interval) return 'Uma vez'
  const v = value || 1
  const singular = v === 1
  switch (interval) {
    case 'minutes':
      return `A cada ${v} ${singular ? 'minuto' : 'minutos'}`
    case 'hours':
      return `A cada ${v} ${singular ? 'hora' : 'horas'}`
    case 'days':
      return `A cada ${v} ${singular ? 'dia' : 'dias'}`
    case 'weeks':
      return `A cada ${v} ${singular ? 'semana' : 'semanas'}`
    case 'months':
      return `A cada ${v} ${singular ? 'mês' : 'meses'}`
    default:
      return interval
  }
}

// --- Main Component ---

export default function RemindersView() {
  const [reminders, setReminders] = useState<Reminder[]>([])

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date()) // Controls the month view
  const [selectedDate, setSelectedDate] = useState(new Date()) // Controls the selection

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<ReminderFormData>({
    title: '',
    content: '',
    scheduled_time: getLocalISOString(new Date(Date.now() + 3600000)),
    repeat_interval: null,
    repeat_value: 1
  })

  // Fetch Data
  const fetchReminders = async () => {
    try {
      const data = await fetchRemindersApi()
      if (Array.isArray(data)) {
        setReminders(data)
      }
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error)
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [])

  // --- Optimization: Group Reminders by Date Key ---
  const remindersMap = useMemo(() => {
    const map = new Map<string, Reminder[]>()
    reminders.forEach((r) => {
      const d = new Date(r.scheduled_time)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(r)
    })
    return map
  }, [reminders])

  // --- Calendar Logic ---

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() // 0-indexed

    // First day of the month (0 = Sunday, 1 = Monday, ...)
    const firstDayOfMonth = new Date(year, month, 1).getDay()

    // Total days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // Total days in PREVIOUS month
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days: { date: Date; isCurrentMonth: boolean; hasEvents: boolean }[] = []

    // Previous month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      days.push({
        date: d,
        isCurrentMonth: false,
        hasEvents: remindersMap.has(key)
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      days.push({
        date: d,
        isCurrentMonth: true,
        hasEvents: remindersMap.has(key)
      })
    }

    // Next month padding (to fill 42 cells grid - 6 rows x 7 cols)
    const remainingCells = 42 - days.length
    for (let i = 1; i <= remainingCells; i++) {
      const d = new Date(year, month + 1, i)
      // Check next month events? sure
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      days.push({
        date: d,
        isCurrentMonth: false,
        hasEvents: remindersMap.has(key)
      })
    }

    return days
  }, [currentDate, remindersMap])

  const selectedDayReminders = useMemo(() => {
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    const dayReminders = remindersMap.get(key) || []
    return dayReminders.sort(
      (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    )
  }, [remindersMap, selectedDate])

  // --- Handlers ---

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const handleOpenCreate = (date?: Date) => {
    const baseDate = date || new Date()
    // Default to 1 hour from now or 9 AM of selected date if it's future
    let schedule = new Date(baseDate)
    const now = new Date()

    if (isSameDay(baseDate, now)) {
      // If today, set to next hour
      schedule = new Date(now.getTime() + 3600000)
    } else {
      // If another day, set to 09:00 AM
      schedule.setHours(9, 0, 0, 0)
    }

    setFormData({
      title: '',
      content: '',
      scheduled_time: getLocalISOString(schedule),
      repeat_interval: null,
      repeat_value: 1
    })
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
    if (!confirm('Excluir este lembrete permanentemente?')) return
    try {
      await deleteReminder(id)
      setReminders((prev) => prev.filter((r) => r.id !== id))
    } catch (error) {
      console.error('Erro ao deletar:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        title: formData.title,
        content: formData.content,
        scheduled_time: new Date(formData.scheduled_time).toISOString(),
        repeat_interval: formData.repeat_interval,
        repeat_value: formData.repeat_interval ? formData.repeat_value : null
      }

      if (formData.id) {
        await updateReminder(formData.id, payload)
      } else {
        await createReminder(payload)
      }

      setIsModalOpen(false)
      fetchReminders()
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="flex h-full w-full bg-bg text-text overflow-hidden">
      {/* --- Sidebar (Selected Day Details) --- */}
      <aside className="w-72 bg-card border-r border-border flex flex-col shrink-0 z-20">
        <div className="p-4 border-b border-border bg-gradient-to-br from-card to-input/20">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold uppercase tracking-tighter leading-none mb-1 text-accent">
                {selectedDate.getDate()}
              </h2>
              <h3 className="text-sm text-text font-bold uppercase tracking-wide">
                {selectedDate.toLocaleDateString('pt-BR', { month: 'long' })}{' '}
                <span className="text-text-muted font-normal">{selectedDate.getFullYear()}</span>
              </h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest px-2 py-1 bg-input/50 rounded">
                {selectedDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2 bg-bg/50">
          {selectedDayReminders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center space-y-3">
              <div className="p-3 bg-white/5 rounded-full border border-white/5">
                <ClockIcon className="w-6 h-6 text-text-muted" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-text">Sem eventos</p>
                <p className="text-[10px] text-text-muted">Nenhum lembrete para este dia</p>
              </div>
            </div>
          ) : (
            selectedDayReminders.map((r) => (
              <div
                key={r.id}
                className={`group relative p-3 rounded-lg border transition-all duration-200 ${
                  r.is_active
                    ? 'bg-card border-border hover:border-accent/50 hover:shadow-sm'
                    : 'bg-input/10 border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded ${
                      r.is_active ? 'bg-accent/10 text-accent' : 'bg-gray-500/10 text-gray-500'
                    }`}
                  >
                    {new Date(r.scheduled_time).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenEdit(r)}
                      className="p-1 rounded hover:bg-input hover:text-accent transition-colors"
                      title="Editar"
                    >
                      <PencilSquareIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Excluir"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <h4
                  className={`font-semibold text-xs leading-snug ${
                    r.is_active
                      ? 'text-text'
                      : 'text-text-muted line-through decoration-text-muted/50'
                  }`}
                >
                  {r.title}
                </h4>
                {r.content && (
                  <p className="text-[10px] text-text-muted mt-1 line-clamp-2 leading-relaxed opacity-80">
                    {r.content}
                  </p>
                )}
                {r.repeat_interval && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                    <svg
                      className="w-2.5 h-2.5 text-accent"
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
                    <span className="text-[9px] uppercase font-bold text-accent/80 tracking-wide">
                      {translateInterval(r.repeat_interval, r.repeat_value)}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-border bg-card">
          <button
            onClick={() => handleOpenCreate(selectedDate)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-accent text-white px-4 rounded-lg font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow shadow-accent/20 group text-xs uppercase tracking-wide"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Lembrete
          </button>
        </div>
      </aside>

      {/* --- Main Calendar View --- */}
      <main className="flex-1 flex flex-col bg-bg relative min-w-0">
        {/* Toolbar */}
        <header className="flex gap-4 items-center justify-between px-6 py-4 border-b border-border bg-card/30 backdrop-blur-sm z-10">
          <h1 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-accent" />
            <span className="text-text">
              {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </h1>

          <div className="flex items-center bg-card rounded-lg border border-border p-0.5 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-input rounded-md text-text-muted hover:text-text transition-all"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-accent transition-colors border-x border-border/50 mx-0.5"
            >
              Hoje
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-input rounded-md text-text-muted hover:text-text transition-all"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Grid */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
          {/* Week Headers */}
          <div className="grid grid-cols-7 mb-2 gap-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-[10px] font-bold uppercase text-text-muted/60 tracking-wider py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-1 min-h-0">
            {calendarData.map((cell, idx) => {
              const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`
              const isSelected = isSameDay(cell.date, selectedDate)
              const isToday = isSameDay(cell.date, new Date())
              const dayReminders = remindersMap.get(key) || []

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedDate(cell.date)
                    // Also switch month view if clicked padding day
                    if (!cell.isCurrentMonth) {
                      setCurrentDate(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1))
                    }
                  }}
                  className={`
                        relative flex flex-col rounded-md border transition-all cursor-pointer overflow-hidden group select-none
                        ${cell.isCurrentMonth ? 'bg-card' : 'bg-input/5 opacity-50'}
                        ${
                          isSelected
                            ? 'ring-1 ring-accent border-transparent z-10 bg-accent/5'
                            : 'border-border/50 hover:border-accent/40'
                        }
                      `}
                >
                  {/* Date Header in Cell */}
                  <div className="flex justify-between items-start p-1.5 shrink-0">
                    <span
                      className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-md transition-all ${
                        isToday
                          ? 'bg-accent text-white'
                          : cell.isCurrentMonth
                            ? 'text-text group-hover:text-accent'
                            : 'text-text-muted'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayReminders.length > 0 && (
                      <span className="text-[9px] font-bold text-text-muted bg-input/80 px-1 rounded-sm">
                        {dayReminders.length}
                      </span>
                    )}
                  </div>

                  {/* Mini List in Cell */}
                  <div className="flex-1 flex flex-col gap-0.5 px-1.5 pb-1 min-h-0 overflow-hidden">
                    {dayReminders.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-1 shrink-0 w-full overflow-hidden"
                      >
                        <div
                          className={`w-1 h-1 rounded-full shrink-0 ${
                            r.is_active ? 'bg-accent' : 'bg-text-muted/50'
                          }`}
                        ></div>
                        <span
                          className={`text-[9px] truncate flex-1 block ${
                            r.is_active ? 'text-text-muted' : 'text-text-muted/40 line-through'
                          }`}
                        >
                          {r.title}
                        </span>
                      </div>
                    ))}
                    {dayReminders.length > 3 && (
                      <div className="text-[8px] font-bold text-accent/70 pl-2">
                        + {dayReminders.length - 3}
                      </div>
                    )}
                  </div>

                  {/* Add Button on Hover */}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-0.5 rounded bg-accent/20 text-accent">
                      <PlusIcon className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* --- Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)}></div>
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="px-5 py-3 border-b border-border bg-input/20 flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-accent" />
                {formData.id ? 'Editar Lembrete' : 'Agendar Novo Lembrete'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text transition-colors"
              >
                Esc
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest pl-1">
                  Título
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  placeholder="Ex: Reunião com a equipe"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-sm font-medium transition-all"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest pl-1">
                  Detalhes (Opcional)
                </label>
                <textarea
                  rows={2}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 outline-none focus:border-accent resize-none text-xs text-text-muted transition-all"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest pl-1">
                    Data e Hora
                  </label>
                  <input
                    required
                    type="datetime-local"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-xs font-mono font-bold transition-all"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest pl-1">
                    Repetição
                  </label>
                  <select
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-xs transition-all appearance-none"
                    value={formData.repeat_interval || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        repeat_interval: (e.target.value || null) as RepeatInterval
                      })
                    }
                  >
                    <option value="">Não repetir</option>
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                    <option value="days">Dias</option>
                    <option value="weeks">Semanas</option>
                    <option value="months">Meses</option>
                  </select>
                </div>
              </div>
              {formData.repeat_interval && (
                <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg border border-accent/10">
                  <span className="text-[10px] font-bold text-accent uppercase whitespace-nowrap">
                    A cada:
                  </span>
                  <input
                    type="number"
                    min="1"
                    className="w-12 bg-bg border border-border rounded px-1 py-0.5 text-center text-xs font-bold text-text outline-none focus:border-accent"
                    value={formData.repeat_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        repeat_value: Math.max(1, parseInt(e.target.value))
                      })
                    }
                  />
                  <span className="text-[10px] font-bold text-accent uppercase tracking-wide">
                    {translateInterval(formData.repeat_interval, formData.repeat_value).replace(
                      /\d+ /,
                      ''
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-3 bg-input/30 border-t border-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:bg-input font-bold text-[10px] uppercase tracking-wide transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-1.5 bg-accent text-bg font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-sm text-[10px] uppercase tracking-wide"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
