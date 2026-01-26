import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode } from '../services/api'

export function useStatus() {
  const [statusInfo, setStatusInfo] = useState<StatusData | null>(null)
  const [localMode, setLocalMode] = useState<string>('groq')
  const [isOnline, setIsOnline] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatusInfo(data)
      setLocalMode(data.mode)
      setIsOnline(data.status === 'ok')

      // Verificar atualização do motor local
      if (data.setup.local_installed && data.setup.installed_version && data.setup.latest_version) {
        if (data.setup.installed_version !== data.setup.latest_version) {
          setHasUpdate(true)
        } else {
          setHasUpdate(false)
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status:', error)
      setStatusInfo(null)
      setIsOnline(false)
    }
  }, [])

  const changeMode = async (mode: string) => {
    if (mode === localMode) return

    console.log('[useStatus] Mudando modo instantaneamente para:', mode)
    const previousMode = localMode

    window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: mode }))

    setLocalMode(mode)
    if (statusInfo) {
      setStatusInfo({ ...statusInfo, mode })
    }

    setIsUpdating(true)
    try {
      await updateMode(mode)
      setIsOnline(true)
    } catch (error) {
      console.error('Erro ao trocar modo, revertendo:', error)
      setLocalMode(previousMode)
      if (statusInfo) setStatusInfo({ ...statusInfo, mode: previousMode })
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [checkStatus])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    hasUpdate,
    refreshStatus: checkStatus,
    changeMode
  }
}
