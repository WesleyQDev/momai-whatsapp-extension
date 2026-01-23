import FloatingCard from './FloatingCard'

interface SettingsCardProps {
  onClose: () => void
}

export default function SettingsCard({ onClose }: SettingsCardProps) {
  return (
    <FloatingCard title="Configurações" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white/90">Início Automático</span>
              <span className="text-xs text-slate-400">Iniciar com o sistema</span>
            </div>
            <div className="w-10 h-6 bg-accent rounded-full flex items-center px-1 cursor-pointer">
              <div className="w-4 h-4 bg-white rounded-full shadow-sm ml-auto" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white/90">Modo Escuro</span>
              <span className="text-xs text-slate-400">Tema da interface</span>
            </div>
            <div className="w-10 h-6 bg-slate-700 rounded-full flex items-center px-1 cursor-pointer">
              <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl bg-accent text-white font-medium hover:opacity-90 transition-all active:scale-95"
        >
          Salvar Alterações
        </button>
      </div>
    </FloatingCard>
  )
}
