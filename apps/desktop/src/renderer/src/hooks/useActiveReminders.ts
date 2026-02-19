import { useEffect, useState } from 'react'
import { fetchActiveReminders, type ActiveReminder } from '../services/api'

type Listener = (data: ActiveReminder[]) => void

let cachedReminders: ActiveReminder[] = []
const subscribers = new Set<Listener>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let retryCount = 0

const notify = () => {
  subscribers.forEach((listener) => listener(cachedReminders))
}

const fetchAndUpdate = async () => {
  try {
    const data = await fetchActiveReminders()
    cachedReminders = data
    retryCount = 0
    notify()
  } catch (error) {
    if (retryCount > 5) {
      console.error('Erro ao buscar proximos lembretes', error)
    }
    retryCount += 1
  }
}

const startPolling = () => {
  if (pollTimer) return
  fetchAndUpdate()
  pollTimer = setInterval(fetchAndUpdate, 10000)
}

const stopPolling = () => {
  if (pollTimer && subscribers.size === 0) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function useActiveReminders() {
  const [reminders, setReminders] = useState<ActiveReminder[]>(cachedReminders)

  useEffect(() => {
    const listener: Listener = (data) => setReminders(data)
    subscribers.add(listener)
    startPolling()

    return () => {
      subscribers.delete(listener)
      stopPolling()
    }
  }, [])

  return { reminders }
}
