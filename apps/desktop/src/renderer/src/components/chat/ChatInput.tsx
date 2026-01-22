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
    <footer className="flex gap-2.5 p-2.5 border-t border-[#252931] items-center">
      <input
        type="text"
        className="flex-1 bg-[#0f1629] border border-[#252931] rounded-[10px] p-2.5 text-text outline-none placeholder:text-text-muted disabled:opacity-50"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading || isModeChanging}
        placeholder="Digite sua mensagem..."
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
      />
      <select
        value={currentMode}
        onChange={(e) => onModeChange(e.target.value)}
        className="bg-[#0f1629] border border-[#252931] rounded-[10px] px-3 py-2.5 text-text text-sm cursor-pointer outline-none transition-all min-w-[100px] hover:border-accent focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
        disabled={isLoading || isModeChanging}
        style={{ opacity: isModeChanging ? 0.7 : 1 }}
      >
        <option value="local">Qwen</option>
        <option value="genai">Gemini</option>
        <option value="groq">Groq</option>
      </select>
      <button 
        type="button" 
        className="bg-accent border-none rounded-[10px] px-[15px] cursor-pointer text-white shrink-0 h-[42px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center hover:opacity-90 transition-opacity"
        onClick={onSend} 
        disabled={isLoading || isModeChanging || !text.trim()}
      >
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
