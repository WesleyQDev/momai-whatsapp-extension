import { useState, useRef, useEffect, useCallback } from 'react'
import { Message, sendChatMessage } from '../services/api'

export function useChat() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId] = useState(() => `thread_${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const sendMessage = useCallback(async () => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    const currentText = text
    setText('')
    setIsLoading(true)

    // Adiciona mensagem vazia do assistente para streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      await sendChatMessage(currentText, threadId, {
        onToken: (token) => {
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + token
            }
            return updated
          })
        },
        onError: (error) => {
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1].content = `Erro: ${error}`
            return updated
          })
        },
        onDone: () => {
          // Stream finalizado
        }
      })
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
  }, [text, isLoading, threadId])

  return {
    text,
    setText,
    messages,
    isLoading,
    sendMessage,
    messagesEndRef
  }
}
