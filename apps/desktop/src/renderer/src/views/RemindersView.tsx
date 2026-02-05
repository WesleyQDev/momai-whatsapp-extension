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

interface Reminder {
  id: number
  title: string
  content: string
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  is_active: boolean
}

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
  const [loading, setLoading] = useState(true)

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
      const response = await fetch('http://localhost:8000/reminders')
      const data = await response.json()
      if (Array.isArray(data)) {
        setReminders(data)
      }
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error)
    } finally {
      setLoading(false)
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
      await fetch(`http://localhost:8000/reminders/${id}`, { method: 'DELETE' })
      setReminders((prev) => prev.filter((r) => r.id !== id))
    } catch (error) {
      console.error('Erro ao deletar:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const method = formData.id ? 'PATCH' : 'POST'
      const url = formData.id
        ? `http://localhost:8000/reminders/${formData.id}`
        : 'http://localhost:8000/reminders'

      const payload = {
        title: formData.title,
        content: formData.content,
        scheduled_time: new Date(formData.scheduled_time).toISOString(),
        repeat_interval: formData.repeat_interval,
        repeat_value: formData.repeat_interval ? formData.repeat_value : null
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        setIsModalOpen(false)
        fetchReminders()
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="flex h-full w-full bg-bg text-text overflow-hidden">
      {/* --- Sidebar (Selected Day Details) --- */}
      <aside className="w-80 bg-card border-r border-border flex flex-col shrink-0 z-20 shadow-xl">
        <div className="p-6 border-b border-border bg-gradient-to-br from-card to-input/20">
          <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-1 text-accent">
            {selectedDate.getDate()}
          </h2>
          <h3 className="text-lg text-text font-bold uppercase tracking-wide">
            {selectedDate.toLocaleDateString('pt-BR', { month: 'long' })}{' '}
            <span className="text-text-muted font-normal">{selectedDate.getFullYear()}</span>
          </h3>
          <p className="text-xs text-text-muted mt-2 uppercase font-black tracking-[0.2em] border-l-2 border-accent/50 pl-2">
            {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-bg/50">
          {selectedDayReminders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 text-center space-y-4">
              <div className="p-4 bg-input rounded-full">
                <ClockIcon className="w-8 h-8 text-text-muted" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-text">Tudo limpo por aqui</p>
                <p className="text-xs text-text-muted">Nenhum lembrete para este dia</p>
              </div>
            </div>
          ) : (
            selectedDayReminders.map((r) => (
              <div
                key={r.id}
                className={`group relative p-4 rounded-xl border transition-all duration-200 ${
                  r.is_active
                    ? 'bg-card border-border hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5'
                    : 'bg-input/10 border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider py-1 px-2 rounded-md ${
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
                      className="p-1.5 rounded-md hover:bg-input hover:text-accent transition-colors"
                      title="Editar"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Excluir"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h4
                  className={`font-bold text-sm leading-snug ${
                    r.is_active
                      ? 'text-text'
                      : 'text-text-muted line-through decoration-2 decoration-text-muted/50'
                  }`}
                >
                  {r.title}
                </h4>
                {r.content && (
                  <p className="text-xs text-text-muted mt-1.5 line-clamp-2 leading-relaxed opacity-80">
                    {r.content}
                  </p>
                )}
                {r.repeat_interval && (
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
                    <svg
                      className="w-3 h-3 text-accent"
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
                    <span className="text-[10px] uppercase font-bold text-accent/80 tracking-wide">
                      {translateInterval(r.repeat_interval, r.repeat_value)}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border bg-card shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
          <button
            onClick={() => handleOpenCreate(selectedDate)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-accent text-bg px-4 rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-accent/20 group"
          >
            <PlusIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            NOVO LEMBRETE
          </button>
        </div>
      </aside>

      {/* --- Main Calendar View --- */}
      <main className="flex-1 flex flex-col bg-bg relative min-w-0">
        {/* Toolbar */}
        <header className="flex flex-wrap gap-4 items-center justify-between px-8 py-6 border-b border-border bg-card/30 backdrop-blur-sm z-10">
          <h1 className="text-3xl font-black italic tracking-tight uppercase flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-accent" />
            <span className="text-text">
              {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </h1>

          <div className="flex items-center bg-card rounded-xl border border-border p-1 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-input rounded-lg text-text-muted hover:text-text transition-all active:scale-95"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-1 text-xs font-black uppercase tracking-widest text-text-muted hover:text-accent transition-colors border-x border-border/50 mx-1"
            >
              Hoje
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-input rounded-lg text-text-muted hover:text-text transition-all active:scale-95"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Grid */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden min-h-0">
          {/* Week Headers */}
          <div className="grid grid-cols-7 mb-2 gap-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-[10px] font-black uppercase text-text-muted/60 tracking-[0.2em] py-2 bg-input/10 rounded-lg"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-2 min-h-0">
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
                        relative flex flex-col rounded-xl border transition-all cursor-pointer overflow-hidden group select-none
                        ${cell.isCurrentMonth ? 'bg-card shadow-sm' : 'bg-input/5 opacity-50 grayscale'}
                        ${
                          isSelected
                            ? 'ring-2 ring-accent border-transparent z-10 shadow-accent-glow'
                            : 'border-border hover:border-accent/40'
                        }
                        ${!cell.isCurrentMonth && !isSelected ? 'hover:opacity-80' : ''}
                      `}
                >
                  {/* Date Header in Cell */}
                  <div className="flex justify-between items-center p-2.5 shrink-0">
                    <span
                      className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all ${
                        isToday
                          ? 'bg-accent text-bg shadow-lg shadow-accent/30 scale-110'
                          : cell.isCurrentMonth
                            ? 'text-text group-hover:bg-input/50'
                            : 'text-text-muted'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayReminders.length > 0 && (
                      <span className="text-[10px] font-black text-text-muted bg-input/50 px-1.5 py-0.5 rounded-md">
                        {dayReminders.length}
                      </span>
                    )}
                  </div>

                  {/* Mini List in Cell */}
                  <div className="flex-1 flex flex-col gap-1 px-2 pb-2 min-h-0 overflow-y-auto custom-scrollbar-none">
                    {dayReminders.slice(0, 4).map((r) => (
                      <div key={r.id} className="flex items-center gap-1.5 shrink-0 w-full">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            r.is_active ? 'bg-accent' : 'bg-text-muted/50'
                          }`}
                        ></div>
                        <span
                          className={`text-[9px] font-bold truncate flex-1 block ${
                            r.is_active ? 'text-text-muted' : 'text-text-muted/40 line-through'
                          }`}
                        >
                          {r.title}
                        </span>
                      </div>
                    ))}
                    {dayReminders.length > 4 && (
                      <div className="text-[9px] font-black text-accent/70 pl-3 pt-0.5 uppercase tracking-wide">
                        + {dayReminders.length - 4} mais
                      </div>
                    )}
                  </div>

                  {/* Add Button on Hover */}
                  <div className="absolute inset-0 bg-black/5 dark:bg-white/5 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <PlusIcon className="w-8 h-8 text-accent drop-shadow-md scale-75 group-hover:scale-100 transition-transform" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* --- Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          ></div>
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="px-6 py-5 border-b border-border bg-input/20 flex justify-between items-center bg-pattern">
              <h3 className="text-xl font-black uppercase tracking-tight italic text-text">
                {formData.id ? 'Editar Lembrete' : 'Novo Lembrete'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text transition-colors"
              >
                Esc
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">
                  O que você precisa lembrar?
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  placeholder="Ex: Reunião com a equipe"
                  className="w-full bg-input border border-border rounded-xl px-4 py-3 outline-none focus:border-accent text-lg font-bold placeholder:text-text-muted/30 transition-all"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">
                  Detalhes (Opcional)
                </label>
                <textarea
                  rows={2}
                  className="w-full bg-input border border-border rounded-xl px-4 py-3 outline-none focus:border-accent resize-none text-sm font-medium transition-all"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">
                    Data e Hora
                  </label>
                  <input
                    required
                    type="datetime-local"
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 outline-none focus:border-accent text-sm font-bold font-mono transition-all"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">
                    Repetição
                  </label>
                  <select
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 outline-none focus:border-accent text-sm font-medium transition-all appearance-none"
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
                <div className="flex items-center gap-3 p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <span className="text-xs font-bold text-accent uppercase whitespace-nowrap">
                    Repetir a cada:
                  </span>
                  <input
                    type="number"
                    min="1"
                    className="w-16 bg-bg border border-border rounded-lg px-2 py-1 text-center font-bold text-text outline-none focus:border-accent"
                    value={formData.repeat_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        repeat_value: Math.max(1, parseInt(e.target.value))
                      })
                    }
                  />
                  <span className="text-xs font-black text-accent uppercase tracking-wide">
                    {translateInterval(formData.repeat_interval, formData.repeat_value).replace(
                      /\d+ /,
                      ''
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 bg-input/30 border-t border-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-border text-text-muted hover:text-text hover:bg-input font-bold text-xs uppercase tracking-wide transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-8 py-2.5 bg-accent text-bg font-black rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 text-xs uppercase tracking-wide"
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
