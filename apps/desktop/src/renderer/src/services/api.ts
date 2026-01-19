const API_URL = 'http://localhost:8000'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface StatusData {
  status: string
  version: string
  mode: string
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void
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
    const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))

    for (const line of lines) {
      const data = JSON.parse(line.slice(6))

      if (data.token) {
        callbacks.onToken(data.token)
      }

      if (data.error) {
        callbacks.onError(data.error)
      }

      if (data.done) {
        callbacks.onDone()
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

export async function updateMode(mode: string): Promise<void> {
  const response = await fetch(`${API_URL}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  if (!response.ok) throw new Error('Erro ao atualizar modo')
}
