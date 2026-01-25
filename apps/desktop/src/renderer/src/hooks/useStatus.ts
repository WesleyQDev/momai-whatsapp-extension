import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode } from '../services/api'

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
    if (mode === localMode) return

    console.log('[useStatus] Mudando modo instantaneamente para:', mode)
    const previousMode = localMode

    // Dispara evento para o histórico criar o card com "⏳"
    window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: mode }))

    // Atualização Otimista (Instantânea no UI)
    setLocalMode(mode)
    if (statusInfo) {
      setStatusInfo({ ...statusInfo, mode })
    }

    setIsUpdating(true)
    try {
      await updateMode(mode)
      // Não precisamos rodar checkStatus aqui, pois já atualizamos o estado localmente.
      // Isso evita o delay do polling do backend.
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
    // Busca inicial
    checkStatus()

    // Polling de status a cada 3 segundos para atualizar ícones de configuração
    const interval = setInterval(checkStatus, 3000)

    return () => clearInterval(interval)
  }, [checkStatus])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    refreshStatus: checkStatus,
    changeMode
  }
}
