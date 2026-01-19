import { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
}

export default function MessageItem({ message, isLoading = false }: MessageItemProps): JSX.Element {
  return (
    <div className={`message ${message.role}`}>
      {message.role === 'assistant' ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content || (isLoading ? '⏳' : '')}
        </ReactMarkdown>
      ) : (
        message.content
      )}
    </div>
  )
}
