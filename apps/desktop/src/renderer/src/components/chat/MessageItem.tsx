import { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import icon from '../../assets/icon.png'

interface MessageItemProps {
  message: Message
  isLoading?: boolean
}

export default function MessageItem({ message, isLoading = false }: MessageItemProps): JSX.Element {
  return (
    <div className={`message-container ${message.role}`}>
      {message.role === 'assistant' && (
        <img src={icon} alt="MomAI" className="avatar" />
      )}
      
      <div className="message">
        {message.role === 'assistant' ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {isLoading && (
              <div className="typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            )}
          </>
        ) : (
          message.content
        )}
      </div>
    </div>
  )
}