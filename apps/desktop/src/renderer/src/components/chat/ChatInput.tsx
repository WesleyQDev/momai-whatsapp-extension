interface ChatInputProps {
  text: string
  setText: (text: string) => void
  onSend: () => void
  isLoading: boolean
  currentMode: string
  onModeChange: (mode: string) => void
  isModeChanging?: boolean
}

export default function ChatInput({
  text,
  setText,
  onSend,
  isLoading,
  currentMode,
  onModeChange,
  isModeChanging = false
}: ChatInputProps) {
  return (
    <footer>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading || isModeChanging}
        placeholder="Digite sua mensagem..."
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
      />
      <select
        value={currentMode}
        onChange={(e) => onModeChange(e.target.value)}
        className="mode-selector-inline"
        disabled={isLoading || isModeChanging}
        style={{ opacity: isModeChanging ? 0.7 : 1 }}
      >
        <option value="local">Qwen</option>
        <option value="genai">Gemini</option>
        <option value="groq">Groq</option>
      </select>
      <button type="button" onClick={onSend} disabled={isLoading || isModeChanging || !text.trim()}>
        <svg
          width="20"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </footer>
  )
}
