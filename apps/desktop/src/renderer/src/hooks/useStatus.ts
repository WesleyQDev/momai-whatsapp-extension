import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode } from '../services/api'

const POLLING_INTERVAL = 5000

export function useStatus() {
  const [statusInfo, setStatusInfo] = useState<StatusData | null>(null)
  const [localMode, setLocalMode] = useState<string>('groq')
  const [isOnline, setIsOnline] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatusInfo(data)
      setLocalMode(data.mode)
      setIsOnline(data.status === 'ok')
    } catch (error) {
      console.error('Erro ao buscar status:', error)
      setStatusInfo(null)
      setIsOnline(false)
    }
  }, [])

  const changeMode = async (mode: string) => {
    console.log('[useStatus] Mudando modo para:', mode)
    const previousStatus = statusInfo
    
    setLocalMode(mode)
    if (statusInfo) {
      setStatusInfo({ ...statusInfo, mode })
    }
    
    setIsUpdating(true)
    try {
      await updateMode(mode)
      await checkStatus()
    } catch (error) {
      console.error('Erro ao trocar modo:', error)
      setStatusInfo(previousStatus)
      if (previousStatus) setLocalMode(previousStatus.mode)
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    // Busca inicial apenas
    checkStatus()

    const handleRemoteChange = (e: any) => {
      const { detail } = e
      console.log('[useStatus] IA trocou modelo remotamente:', detail)
      setLocalMode(detail)
      if (statusInfo) {
        setStatusInfo({ ...statusInfo, mode: detail })
      }
    }

    window.addEventListener('ai_model_changed', handleRemoteChange)

    return () => {
      window.removeEventListener('ai_model_changed', handleRemoteChange)
    }
  }, [checkStatus, statusInfo])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    refreshStatus: checkStatus,
    changeMode
  }
}
