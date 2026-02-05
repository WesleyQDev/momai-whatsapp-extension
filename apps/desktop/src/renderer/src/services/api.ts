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

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader) throw new Error('Stream não disponível')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)

    const dataParts = chunk.split('data: ').filter((p) => p.trim() !== '')

    for (const part of dataParts) {
      try {
        const cleanPart = part.trim()
        if (!cleanPart) continue

        const data = JSON.parse(cleanPart)

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
        console.error('Erro ao processar part JSON:', e, 'Part:', part)
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

export async function fetchInitStatus(): Promise<{ stage: string, message: string, progress: number }> {
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
