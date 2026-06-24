import { cleanMomaiActions, stripEmojisAndMarkdown } from 'momai:text'
import { API_URL } from 'momai:constants'

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // Use the renderer's native fetch (Chromium's) instead of
  // window.api.apiFetch. The preload's fetch in Electron 42 is undici
  // (Node.js), which sends user-agent "node" and ignores the origin's
  // CORS context. Adding the Authorization header here is the single
  // point of token injection for all renderer→backend requests.
  const token = window.api.getSessionToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (options.headers) {
    const h = options.headers as Record<string, string> | Headers
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k] = v
      })
    } else {
      Object.assign(headers, h)
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  // If the path is already a full URL (some callers construct the URL
  // themselves), use it as-is. Otherwise prepend API_URL.
  const url = /^https?:\/\//.test(path) ? path : `${API_URL}${path}`
  return fetch(url, { ...options, headers })
}

// Wrapper that returns a parsed envelope. Use this for simple JSON
// request/response endpoints where you want .ok/.data/.status.
async function apiCall(
  path: string,
  options: RequestInit = {}
): Promise<{
  ok: boolean
  status: number
  data: any
}> {
  const res = await apiFetch(path, options)
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}: ${res.statusText}`)
    err.response = { status: res.status, statusText: res.statusText, data }
    throw err
  }
  return { ok: res.ok, status: res.status, data }
}

export const api = {
  get: (path: string) => apiCall(path),
  post: (path: string, body?: any) =>
    apiCall(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) =>
    apiCall(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => apiCall(path, { method: 'DELETE' })
}

export interface StructuredResponse {
  type: string
  data: Record<string, any>
}

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  isGraph?: boolean
  graphData?: {
    view: 'center' | 'side' | 'chat' | null
    content: string
    options: string[]
    optionsMap?: Record<string, string>
    options_map?: Record<string, string>
    uiSchema?: any
  }
  activities?: string[]
  sources?: Source[]
  snippets?: Snippet[]
  cards?: Card[]
  toolSteps?: any[]
  activeSkill?: string
  structuredResponse?: StructuredResponse
}

export interface StatusData {
  status: string
  mode: string
  brain_ready: boolean
  is_loading: boolean
  setup: {
    local_installed: boolean
    installed_version?: string
    latest_version?: string
  }
  ai_tier: string | null
  tiers_config?: Record<string, any>
  llama_runtime?: {
    loaded_model_name: string | null
    [key: string]: any
  }
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void
  onStatus: (status: string) => void
  onError: (error: string) => void
  onDone: () => void
  onSources?: (sources: Source[]) => void
  onSnippets?: (snippets: Snippet[]) => void
  onCards?: (cards: Card[]) => void
  onToolSteps?: (steps: any[]) => void
  onActiveSkill?: (skillName: string) => void
  onStructuredResponse?: (response: StructuredResponse) => void
}

export interface ChatMessageOptions {
  memory_context?: string
  memory_sources?: Source[]
  signal?: AbortSignal
}

export interface Source {
  url: string
  title: string
  snippet: string
}

export interface Snippet {
  title: string
  content: string
  icon?: string
}

export interface Card {
  type: string
  title: string
  [key: string]: any
}

export async function sendChatMessage(
  content: string,
  threadId: string,
  callbacks: ChatStreamCallbacks,
  options?: ChatMessageOptions
): Promise<void> {
  const { signal, ...bodyOptions } = options ?? {}
  const response = await apiFetch(`/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, thread_id: threadId, ...bodyOptions }),
    ...(signal ? { signal } : {})
  })

  if (!response.ok) {
    throw new Error('Erro ao iniciar stream de chat')
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  if (!reader) throw new Error('Stream não disponível')

  try {
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

          if (data.sources && callbacks.onSources) {
            callbacks.onSources(data.sources)
          }

          if (data.snippets && callbacks.onSnippets) {
            callbacks.onSnippets(data.snippets)
          }

          if (data.cards && callbacks.onCards) {
            callbacks.onCards(data.cards)
          }

          if (data.tool_steps && callbacks.onToolSteps) {
            callbacks.onToolSteps(data.tool_steps)
          }

          if (data.active_skill && callbacks.onActiveSkill) {
            callbacks.onActiveSkill(data.active_skill)
          }

          if (data.structured_response && callbacks.onStructuredResponse) {
            callbacks.onStructuredResponse(data.structured_response)
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
  } catch (err) {
    if (signal?.aborted) {
      return
    }
    throw err
  }
}

export async function fetchStatus(): Promise<StatusData> {
  const response = await apiFetch(`/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return response.json()
}

export async function stopGeneration(): Promise<void> {
  const response = await apiFetch(`/chat/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao parar geracao')
}

export async function resetChatContextUsage(): Promise<void> {
  const response = await apiFetch(`/chat/context/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao resetar contexto')
}

export async function stopVoice(): Promise<void> {
  try {
    const { getTTSServiceRenderer } = await import('./ttsService')
    getTTSServiceRenderer().stop()
  } catch {}
  try {
    const response = await apiFetch(`/chat/stop-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error('Erro ao parar voz')
  } catch {}
}

import { getTTSServiceRenderer } from 'momai:tts-service'

export async function speakText(text: string, engine?: string): Promise<void> {
  const cleanText = stripEmojisAndMarkdown(text)

  if (engine && engine !== 'kokoro') {
    const ttsService = getTTSServiceRenderer()
    const response = await ttsService.speak(cleanText, engine as any)
    if (!response.success) {
      throw new Error(response.error || 'Erro ao falar')
    }
    return
  }

  const response = await apiFetch(`/chat/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText })
  })
  if (!response.ok) throw new Error('Erro ao ler texto')
}

export async function updateTtsStatus(isSpeaking: boolean): Promise<void> {
  try {
    const response = await apiFetch(`/voice/tts-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_speaking: isSpeaking })
    })
    if (!response.ok) throw new Error('Erro ao atualizar status do TTS')
  } catch {}
}

export async function fetchInitStatus(): Promise<{
  stage: string
  message: string
  progress: number
  error?: string | null
}> {
  const response = await apiFetch(`/init-status`)
  if (!response.ok) throw new Error('Erro ao buscar status de inicialização')
  return response.json()
}

export async function updateMode(mode: string): Promise<void> {
  const response = await apiFetch(`/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  if (!response.ok) throw new Error('Erro ao atualizar modo')
}

export function safeJsonParse(str: string | null | undefined): any {
  if (!str) return undefined
  try {
    return JSON.parse(str)
  } catch {
    return undefined
  }
}

export async function fetchChatHistory(threadId: string = 'default'): Promise<Message[]> {
  const response = await apiFetch(`/chat/history?thread_id=${threadId}`)
  if (!response.ok) throw new Error('Erro ao buscar histórico')
  const messages = await response.json()
  if (!Array.isArray(messages)) return []

  return messages.map((msg: any) => ({
    ...msg,
    sources: safeJsonParse(msg.sources),
    snippets: safeJsonParse(msg.snippets),
    cards: safeJsonParse(msg.cards),
    toolSteps: msg.graph_data && msg.graph_data.tool_steps ? msg.graph_data.tool_steps : undefined,
    structuredResponse: safeJsonParse(msg.structured_response)
  }))
}

export interface ChatSession {
  id: string
  lastActivity: string | null
  messageCount: number
  firstMessage: string | null
  title: string | null
}

export async function fetchSessions(): Promise<ChatSession[]> {
  const response = await apiFetch(`/chat/sessions`)
  if (!response.ok) throw new Error('Erro ao buscar sessoes')
  const data = await response.json()
  return data.sessions || []
}

export async function clearChatHistory(threadId: string = 'default'): Promise<void> {
  const response = await apiFetch(`/chat/history?thread_id=${threadId}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao limpar histórico')
}

export async function generateSessionTitle(
  threadId: string,
  userMessage: string,
  assistantMessage?: string
): Promise<string | null> {
  try {
    const response = await apiFetch(`/chat/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
        user_message: userMessage,
        assistant_message: assistantMessage
      })
    })
    if (!response.ok) return null
    const data = await response.json()
    const title = data.title || null
    return title ? cleanMomaiActions(title) : null
  } catch {
    return null
  }
}

export async function deleteMessage(messageId: number): Promise<void> {
  const response = await apiFetch(`/chat/message/${messageId}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao excluir mensagem')
}

// --- EXTENSIONS ---

export interface Extension {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  installed?: boolean
  icon?: string
  version?: string
  error?: string
  author?: string
  is_official?: boolean
  download_url?: string
  tags?: string[]
  manifest?: any
  permissionSummary?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  instructions?: string
  readme?: string
  repo?: string
  stars?: number
  compatibility?: string
  features?: {
    sidebar?: boolean
    sidebarPanel?: {
      icon: string
      label: string
      panelEndpoint: string
    } | null
  }
}

export async function fetchExtensions(lang?: string): Promise<Extension[]> {
  const url = lang ? `${API_URL}/extensions?lang=${lang}` : `${API_URL}/extensions`
  const response = await apiFetch(url)
  if (!response.ok) throw new Error('Erro ao buscar extensões instaladas')
  return response.json()
}

export async function fetchExtensionRegistry(lang?: string): Promise<any[]> {
  const url = lang
    ? `${API_URL}/extensions/registry?lang=${lang}`
    : `${API_URL}/extensions/registry`
  const response = await apiFetch(url)
  if (!response.ok) throw new Error('Erro ao buscar registro de extensões')
  return response.json()
}

export async function installExtension(
  id: string,
  downloadUrl: string,
  onProgress?: (progress: { percent: number; speed: string; status: string }) => void
): Promise<void> {
  const response = await apiFetch(`/extensions/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, download_url: downloadUrl })
  })

  if (!response.ok) throw new Error('Erro ao iniciar instalação de extensão')

  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line)
            if (data.status && onProgress) {
              onProgress(data)
            }
            if (data.error) {
              throw new Error(data.error)
            }
          } catch (e) {
            if (
              e instanceof Error &&
              e.message !== 'Unexpected end of JSON input' &&
              e.message !== 'Unexpected token o in JSON at position 1'
            ) {
              throw e
            }
          }
        }
      }
    }
  }
}

export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
  const response = await apiFetch(`/extensions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled })
  })
  if (!response.ok) throw new Error('Erro ao alterar status da extensão')
}

export async function uninstallExtension(id: string): Promise<void> {
  const response = await apiFetch(`/extensions/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled: false }) // Reusing ExtensionToggle schema
  })
  if (!response.ok) throw new Error('Erro ao desinstalar extensão')
}

export async function sendExtensionAction(id: string, action: string, payload: any): Promise<any> {
  const response = await apiFetch(`/extensions/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  })
  if (!response.ok) throw new Error('Erro ao enviar ação para extensão')
  return response.json()
}

export async function fetchSkillKeywords(): Promise<Record<string, string[]>> {
  const response = await apiFetch(`/skills/keywords`)
  if (!response.ok) throw new Error('Erro ao buscar palavras-chave')
  return response.json()
}

export async function updateSkillKeywords(skillId: string, keywords: string[]): Promise<void> {
  const response = await apiFetch(`/skills/keywords/${skillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords })
  })
  if (!response.ok) throw new Error('Erro ao salvar palavras-chave')
}

// --- GAMING MODE ---

export interface GamingApp {
  id: number
  name: string
  executable: string
  is_active: boolean
}

export async function fetchGamingApps(): Promise<GamingApp[]> {
  const response = await apiFetch(`/system/gaming-apps`)
  if (!response.ok) throw new Error('Erro ao buscar apps de jogo')
  return response.json()
}

export async function addGamingApp(name: string, executable: string): Promise<void> {
  const response = await apiFetch(`/system/gaming-apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, executable })
  })
  if (!response.ok) throw new Error('Erro ao adicionar app de jogo')
}

export async function deleteGamingApp(id: number): Promise<void> {
  const response = await apiFetch(`/system/gaming-apps/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao remover app de jogo')
}

export async function fetchEconomyConfig(): Promise<any> {
  const response = await apiFetch(`/economy/config`)
  if (!response.ok) throw new Error('Erro ao buscar config economia')
  return response.json()
}

export async function updateEconomyConfig(config: Record<string, any>): Promise<void> {
  const response = await apiFetch(`/economy/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!response.ok) throw new Error('Erro ao atualizar config economia')
}

// --- SETTINGS ---

export interface SettingsData {
  user_name?: string
  tts_voice?: string
  tts_enabled: boolean
  wake_word_enabled: boolean
  locale?: string
  min_interface_chars?: number
  prebuffer_chars?: number
  onboarding_completed?: boolean
  tutorial_completed?: boolean
  ai_tier?: string | null
  context_window_mode?: 'min' | 'medium' | 'max' | 'custom'
  context_window_tokens?: number
  skip_intro?: boolean
  daily_briefing_enabled?: boolean
}

export async function fetchSettings(): Promise<SettingsData> {
  const response = await apiFetch(`/settings`)
  if (!response.ok) throw new Error('Erro ao buscar configuracoes')
  return response.json()
}

export async function updateSettingsPartial(payload: Partial<SettingsData>): Promise<void> {
  const response = await apiFetch(`/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar configuracoes')
}

export async function setCallMode(enabled: boolean): Promise<void> {
  const response = await apiFetch(`/mode/call-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  })
  if (!response.ok) throw new Error('Erro ao definir modo chamada')
}

// --- QUICK VOICE TRANSCRIPTION ---

export interface QuickTranscriptionResponse {
  text: string
  success: boolean
}

export async function quickTranscribe(): Promise<QuickTranscriptionResponse> {
  const response = await apiFetch(`/voice/quick-transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao transcrever audio')
  return response.json()
}

export async function stopQuickTranscribe(): Promise<void> {
  const response = await apiFetch(`/voice/stop-quick-transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao parar gravação')
}

// --- EXTERNAL MEMORY ---

export interface NoteSummary {
  id: string
  title: string
  path: string
  source: string
  created_at?: string | null
  updated_at?: string | null
  preview?: string
}

export interface NoteDetail extends NoteSummary {
  content: string
}

export interface MemorySearchResult {
  note_id: string
  chunk_id: string
  title: string
  path: string
  text: string
  score: number
  keyword_score?: number
  vector_score?: number
}

export async function listMemoryNotes(): Promise<NoteSummary[]> {
  return window.api.notes.list()
}

export async function getMemoryNote(noteId: string): Promise<NoteDetail> {
  const note = await window.api.notes.get(noteId)
  if (!note) throw new Error('Erro ao buscar nota')
  return note
}

export async function createMemoryNote(
  title: string,
  content: string,
  path?: string
): Promise<NoteDetail> {
  return window.api.notes.create({ title, content, path })
}

export async function updateMemoryNote(
  noteId: string,
  payload: { title?: string; content?: string; path?: string }
): Promise<NoteDetail> {
  const updated = await window.api.notes.update(noteId, payload)
  if (!updated) throw new Error('Erro ao atualizar nota')
  return updated
}

export async function openNoteFolder(noteId: string): Promise<boolean> {
  return window.api.notes.openFolder(noteId)
}

export async function listMemoryFolders(): Promise<string[]> {
  return window.api.notes.listFolders()
}

export async function createMemoryFolder(path: string): Promise<void> {
  await window.api.notes.createFolder(path)
}

export async function renameMemoryFolder(oldPath: string, newPath: string): Promise<void> {
  const success = await window.api.notes.renameFolder(oldPath, newPath)
  if (!success) throw new Error('Erro ao renomear pasta')
}

export async function deleteMemoryFolder(path: string): Promise<void> {
  const success = await window.api.notes.deleteFolder(path)
  if (!success) throw new Error('Erro ao excluir pasta')
}

export async function deleteMemoryNote(noteId: string): Promise<void> {
  const deleted = await window.api.notes.delete(noteId)
  if (!deleted) throw new Error('Erro ao remover nota')
}

export async function importMemoryNotes(files: { name: string; content: string }[]): Promise<void> {
  await window.api.notes.import(files)
}

export async function searchMemory(query: string, limit = 6): Promise<MemorySearchResult[]> {
  return window.api.notes.search(query, limit)
}

// --- REMINDERS ---

export interface Reminder {
  id: number
  title: string
  content: string | null
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  repeat_count: number | null
  trigger_count: number
  is_active: boolean
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}

export interface ActiveReminder {
  id: number
  title: string
  content?: string | null
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  repeat_count: number | null
  trigger_count: number
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}

export async function fetchReminders(): Promise<Reminder[]> {
  const response = await apiFetch(`/reminders`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes')
  return response.json()
}

export async function fetchActiveReminders(): Promise<ActiveReminder[]> {
  const response = await apiFetch(`/reminders/active`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes ativos')
  return response.json()
}

export async function createReminder(payload: {
  title: string
  content: string
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  repeat_count?: number | null
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}): Promise<void> {
  const response = await apiFetch(`/reminders`, {
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
    repeat_count?: number | null
    is_active?: boolean
    note_id?: string | null
    action_type?: 'reminder' | 'cron'
    voice_response?: boolean
  }
): Promise<void> {
  const response = await apiFetch(`/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar lembrete')
}

export async function deleteReminder(id: number): Promise<void> {
  const response = await apiFetch(`/reminders/${id}`, { method: 'DELETE' })
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
  const response = await apiFetch(`/extensions/hardware-stats`)
  if (!response.ok) throw new Error('Erro ao buscar stats de hardware')
  return response.json()
}
