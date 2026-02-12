type ReminderLike = {
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
}

const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate()

export function getNextOccurrence(reminder: ReminderLike, now = new Date()): Date {
  const base = new Date(reminder.scheduled_time)
  const interval = reminder.repeat_interval
  const value = reminder.repeat_value || 1

  if (!interval) return base
  if (now <= base) return base

  if (interval === 'minutes' || interval === 'hours') {
    const intervalMs = value * (interval === 'minutes' ? MS_PER_MINUTE : MS_PER_HOUR)
    const k = Math.ceil((now.getTime() - base.getTime()) / intervalMs)
    return new Date(base.getTime() + k * intervalMs)
  }

  if (interval === 'days' || interval === 'weeks') {
    const periodMs = value * (interval === 'weeks' ? 7 : 1) * MS_PER_DAY
    const k = Math.ceil((now.getTime() - base.getTime()) / periodMs)
    return new Date(base.getTime() + k * periodMs)
  }

  if (interval === 'months') {
    const occurrence = new Date(base)
    let guard = 0
    while (occurrence < now && guard < 1200) {
      occurrence.setMonth(occurrence.getMonth() + value)
      guard += 1
    }
    return occurrence
  }

  return base
}

export function getOccurrenceForDate(
  reminder: ReminderLike,
  day: Date,
  now = new Date()
): Date | null {
  const base = new Date(reminder.scheduled_time)
  const interval = reminder.repeat_interval
  const value = reminder.repeat_value || 1

  if (!interval) return base

  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  if (interval === 'minutes' || interval === 'hours') {
    const intervalMs = value * (interval === 'minutes' ? MS_PER_MINUTE : MS_PER_HOUR)
    const minTime = isSameDay(day, now) ? now : dayStart
    const target = minTime < base ? base : minTime
    const k = Math.ceil((target.getTime() - base.getTime()) / intervalMs)
    const occurrence = new Date(base.getTime() + Math.max(0, k) * intervalMs)
    if (occurrence < dayStart || occurrence > dayEnd) return null
    return occurrence
  }

  const occurrence = new Date(dayStart)
  occurrence.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds())
  if (occurrence < base) return null

  if (interval === 'months') {
    const monthsDiff =
      (occurrence.getFullYear() - base.getFullYear()) * 12 +
      (occurrence.getMonth() - base.getMonth())
    if (monthsDiff % value !== 0) return null
  }

  if (interval === 'weeks') {
    const weeksDiff = Math.floor((occurrence.getTime() - base.getTime()) / MS_PER_DAY / 7)
    if (weeksDiff % value !== 0) return null
  }

  if (interval === 'days') {
    const daysDiff = Math.floor((occurrence.getTime() - base.getTime()) / MS_PER_DAY)
    if (daysDiff % value !== 0) return null
  }

  return occurrence
}
