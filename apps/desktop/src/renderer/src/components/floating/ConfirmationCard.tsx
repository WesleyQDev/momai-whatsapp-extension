import FloatingCard from './FloatingCard'

interface ConfirmationCardProps {
  title: string
  message: string
  options: string[]
  onSelect: (option: string) => void
  onCancel: () => void
}

export default function ConfirmationCard({
  title,
  message,
  options,
  onSelect,
  onCancel
}: ConfirmationCardProps) {
  return (
    <FloatingCard title={title} onClose={onCancel}>
      <div className="flex flex-col gap-6">
        <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
        <div className="flex flex-wrap gap-3 mt-2">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => onSelect(option)}
              className={`flex-1 min-w-[100px] px-4 py-2.5 rounded-xl font-medium transition-all active:scale-95 shadow-lg ${
                option.toLowerCase() === 'sim' || option.toLowerCase() === 'confirmar'
                  ? 'bg-accent text-white hover:opacity-90 shadow-accent/20'
                  : 'border border-white/5 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </FloatingCard>
  )
}
