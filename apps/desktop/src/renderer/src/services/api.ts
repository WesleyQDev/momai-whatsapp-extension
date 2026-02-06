import axios from 'axios'

const API_URL = 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL
})

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  isGraph?: boolean
  graphData?: {
    view: 'center' | 'side' | null
    content: string
    options: string[]
    uiSchema?: any
  }
  activities?: string[]
}

export interface StatusData {
  status: string
  version: string
  mode: string
  brain_ready: boolean
  is_loading: boolean
  setup: {
    local_installed: boolean
    installed_version?: string
    latest_version?: string
  }
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void
  onStatus: (status: string) => void
  onError: (error: string) => void
  onDone: () => void
}

export async function sendChatMessage(
  content: string,
  threadId: string,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, thread_id: threadId })
  })

  if (!response.ok) {
    throw new Error('Erro ao iniciar stream de chat')
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  if (!reader) throw new Error('Stream não disponível')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const payload = trimmed.replace(/^data:\s*/, '').trim()
      if (!payload) continue

      try {
        const data = JSON.parse(payload)

        if (data.token) {
          callbacks.onToken(data.token)
        }

        if (data.status) {
          callbacks.onStatus(data.status)
        }

        if (data.error) {
          callbacks.onError(data.error)
        }

        if (data.done) {
          callbacks.onDone()
        }
      } catch (e) {
        console.error('Erro ao processar JSON do stream:', e, 'Linha:', line)
      }
    }
  }
}

export async function fetchStatus(): Promise<StatusData> {
  const response = await fetch(`${API_URL}/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return response.json()
}

export async function fetchInitStatus(): Promise<{
  stage: string
  message: string
  progress: number
}> {
  const response = await fetch(`${API_URL}/init-status`)
  if (!response.ok) throw new Error('Erro ao buscar status de inicialização')
  return response.json()
}

export async function updateMode(mode: string): Promise<void> {
  const response = await fetch(`${API_URL}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  if (!response.ok) throw new Error('Erro ao atualizar modo')
}

export async function fetchChatHistory(threadId: string = 'default'): Promise<Message[]> {
  const response = await fetch(`${API_URL}/chat/history?thread_id=${threadId}`)
  if (!response.ok) throw new Error('Erro ao buscar histórico')
  return response.json()
}

export async function clearChatHistory(threadId: string = 'default'): Promise<void> {
  const response = await fetch(`${API_URL}/chat/history?thread_id=${threadId}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao limpar histórico')
}

// --- EXTENSIONS ---

export interface Extension {
  id: string
  name: string
  author: string
  version: string
  description: string
  icon?: string
  enabled: boolean
  category: 'builtin' | 'extensions' | 'user'
  error?: string | null
  features: {
    sidebar?: boolean
    agent_name?: string
    ui_view?: string
    ui_schema?: any[]
  }
}

export async function fetchExtensions(): Promise<Extension[]> {
  const response = await fetch(`${API_URL}/extensions`)
  if (!response.ok) throw new Error('Erro ao buscar extensões instaladas')
  return response.json()
}

export async function fetchExtensionRegistry(): Promise<any[]> {
  const response = await fetch(`${API_URL}/extensions/registry`)
  if (!response.ok) throw new Error('Erro ao buscar registro de extensões')
  return response.json()
}

export async function installExtension(id: string, downloadUrl: string): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, download_url: downloadUrl })
  })
  if (!response.ok) throw new Error('Erro ao instalar extensão')
}

export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled })
  })
  if (!response.ok) throw new Error('Erro ao alterar status da extensão')
}

export async function uninstallExtension(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled: false }) // Reusing ExtensionToggle schema
  })
  if (!response.ok) throw new Error('Erro ao desinstalar extensão')
}

// --- GAMING MODE ---

export interface GamingApp {
  id: number
  name: string
  executable: string
  is_active: boolean
}

export async function fetchGamingApps(): Promise<GamingApp[]> {
  const response = await fetch(`${API_URL}/system/gaming-apps`)
  if (!response.ok) throw new Error('Erro ao buscar apps de jogo')
  return response.json()
}

export async function addGamingApp(name: string, executable: string): Promise<void> {
  const response = await fetch(`${API_URL}/system/gaming-apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, executable })
  })
  if (!response.ok) throw new Error('Erro ao adicionar app de jogo')
}

export async function deleteGamingApp(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/system/gaming-apps/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao remover app de jogo')
}

// --- SETTINGS ---

export interface SettingsData {
  tts_enabled: boolean
  wake_word_enabled: boolean
}

export async function fetchSettings(): Promise<SettingsData> {
  const response = await fetch(`${API_URL}/settings`)
  if (!response.ok) throw new Error('Erro ao buscar configuracoes')
  return response.json()
}

export async function updateSettingsPartial(payload: Partial<SettingsData>): Promise<void> {
  const response = await fetch(`${API_URL}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar configuracoes')
}

// --- REMINDERS ---

export interface Reminder {
  id: number
  title: string
  content: string | null
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  is_active: boolean
}

export interface ActiveReminder {
  id: number
  title: string
  scheduled_time: string
}

export async function fetchReminders(): Promise<Reminder[]> {
  const response = await fetch(`${API_URL}/reminders`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes')
  return response.json()
}

export async function fetchActiveReminders(): Promise<ActiveReminder[]> {
  const response = await fetch(`${API_URL}/reminders/active`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes ativos')
  return response.json()
}

export async function createReminder(payload: {
  title: string
  content: string
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
}): Promise<void> {
  const response = await fetch(`${API_URL}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao criar lembrete')
}

export async function updateReminder(
  id: number,
  payload: {
    title?: string
    content?: string
    scheduled_time?: string
    repeat_interval?: string | null
    repeat_value?: number | null
    is_active?: boolean
  }
): Promise<void> {
  const response = await fetch(`${API_URL}/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar lembrete')
}

export async function deleteReminder(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/reminders/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Erro ao deletar lembrete')
}

// --- HARDWARE ---

export interface HardwareStats {
  cpu_usage: number
  ram_usage: number
  active_processes: number
  vram_usage: number
}

export async function fetchHardwareStats(): Promise<HardwareStats> {
  const response = await fetch(`${API_URL}/extensions/hardware-stats`)
  if (!response.ok) throw new Error('Erro ao buscar stats de hardware')
  return response.json()
}
