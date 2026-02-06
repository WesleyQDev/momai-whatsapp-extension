import FloatingCard from './FloatingCard'
import { ShieldExclamationIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

interface SecurityConfirmProps {
  isOpen: boolean
  extensionName: string
  extensionAuthor: string
  onConfirm: () => void
  onCancel: () => void
}

export default function SecurityConfirm({
  isOpen,
  extensionName,
  extensionAuthor,
  onConfirm,
  onCancel
}: SecurityConfirmProps) {
  if (!isOpen) return null

  const isOfficial = extensionAuthor === 'WesleyQDev'

  return (
    <FloatingCard title="Confirmação de Segurança" onClose={onCancel} width="max-w-md">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center ${isOfficial ? 'bg-accent/10 text-accent' : 'bg-orange-500/10 text-orange-400'}`}
        >
          {isOfficial ? (
            <ShieldCheckIcon className="w-8 h-8" />
          ) : (
            <ShieldExclamationIcon className="w-8 h-8" />
          )}
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-text">Ativar Extensão?</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            A extensão <span className="text-text font-bold">"{extensionName}"</span> deseja
            executar código Python no seu computador.
          </p>
        </div>

        {!isOfficial && (
          <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-left">
            <h4 className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">
              Aviso de Terceiro
            </h4>
            <p className="text-[10px] text-orange-400/80 leading-relaxed font-medium">
              Esta extensão não foi verificada pelo time oficial da MomAI. Use apenas se você confia
              na fonte e no autor.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 w-full mt-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-border text-text-muted text-xs font-bold hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-2 rounded-lg text-white text-xs font-bold shadow-md transition-all hover:brightness-110 ${isOfficial ? 'bg-accent shadow-accent/20' : 'bg-orange-500 shadow-orange-500/20'}`}
          >
            Ativar Agora
          </button>
        </div>
      </div>
    </FloatingCard>
  )
}
