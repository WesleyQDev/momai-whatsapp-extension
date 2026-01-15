import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const API_URL = 'http://localhost:8000'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function App(): React.JSX.Element {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState(() => `thread_${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (): Promise<void> => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    const currentText = text
    setText('')
    setIsLoading(true)

    // Adiciona mensagem vazia do assistente para streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentText, thread_id: threadId })
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
            setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: updated[lastIdx].content + data.token
              }
              return updated
            })
          }

          if (data.error) {
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1].content = `Erro: ${data.error}`
              return updated
            })
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1].content =
          error instanceof Error ? error.message : 'Erro ao processar mensagem'
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>MomAI</h1>
      </header>

      <main className="messages">
        {messages.length === 0 && <div className="empty">Como posso ajudar você hoje?</div>}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content || (isLoading ? 'Processando a mensagem' : '')}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isLoading}
          placeholder="Digite sua mensagem..."
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button type="button" onClick={handleSendMessage} disabled={isLoading || !text.trim()}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </footer>
    </div>
  )
}

export default App
