import { StatusData } from '../services/api'
import logo from '../assets/icon.png'

interface StatusProps {
  statusInfo: StatusData | null
}

export default function Status({ statusInfo }: StatusProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[15px]">
      <img src={logo} alt="MomAI Logo" className="w-20 h-auto opacity-80" />
      {statusInfo && (
        <div className="flex items-center gap-3 bg-slate-800/40 px-3 py-1.5 rounded-[20px] border border-white/10 text-xs text-text-muted">
          <span className="font-mono">v{statusInfo.version}</span>
          <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${statusInfo.status === 'ok' ? 'bg-green-500 text-green-500' : 'bg-red-500 text-red-500'}`}></span>
          <span className="uppercase font-semibold tracking-wide text-accent">{statusInfo.mode}</span>
        </div>
      )}
    </div>
  )
}
