import { StatusData } from '../services/api'
import logo from '../assets/icon.png'

interface StatusProps {
  statusInfo: StatusData | null
}

export default function Status({ statusInfo }: StatusProps) {
  return (
    <div className="status">
      <img src={logo} alt="MomAI Logo" />
      {statusInfo && (
        <div className="status-info">
          <span className="version">v{statusInfo.version}</span>
          <span className={`indicator ${statusInfo.status}`}></span>
          <span className="mode">{statusInfo.mode}</span>
        </div>
      )}
    </div>
  )
}
