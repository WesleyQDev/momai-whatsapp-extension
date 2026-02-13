import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode, fetchInitStatus } from '../services/api'

export function useStatus() {
  const [statusInfo, setStatusInfo] = useState<StatusData | null>(null)
  const [localMode, setLocalMode] = useState<string>('waiting')
  const [isOnline, setIsOnline] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)

  const [initMessage, setInitMessage] = useState<string>('Iniciando...')
  const [initProgress, setInitProgress] = useState<number>(0)
  const [isBooting, setIsBooting] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [hasReceivedWSEvent, setHasReceivedWSEvent] = useState(false)

  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isReady = initProgress >= 100 && !isBooting && isBrainReady && !isBrainLoading

  // Polling de fallback para progresso de init (caso WebSocket demore)
  const checkInitProgress = useCallback(async () => {
    if (hasReceivedWSEvent || initProgress >= 100) return

    try {
      const data = await (fetchInitStatus() as any)

      setInitMessage(data.message)
      setInitProgress(data.progress)

      if (data.progress >= 100) {
        setIsBooting(false)
      }
    } catch {
      // Silent fail
    }
  }, [hasReceivedWSEvent, initProgress])

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatusInfo(data)
      setLocalMode(data.mode)
      setIsOnline(data.status === 'ok')

      // Evita encerrar boot antes do modelo estar realmente pronto
      if (data.status === 'ok' && data.brain_ready && !data.is_loading) {
        setIsBooting(false)
        setInitProgress(100)
      }

      setRetryCount(0)

      if (data.setup.local_installed && data.setup.installed_version && data.setup.latest_version) {
        setHasUpdate(data.setup.installed_version !== data.setup.latest_version)
      }
    } catch (error) {
      if (!isBooting || retryCount > 10) {
        console.error('Erro ao buscar status:', error)
      }
      setStatusInfo(null)
      setIsOnline(false)
      setRetryCount((prev) => prev + 1)
    }
  }, [isBooting, retryCount])

  useEffect(() => {
    const handleInitProgress = (e: any) => {
      const { message, progress } = e.detail
      setHasReceivedWSEvent(true)
      setInitMessage(message)
      setInitProgress(progress)

      if (progress >= 100) {
        setIsBooting(false)
      }
    }

    window.addEventListener('momai_init_progress', handleInitProgress)
    return () => window.removeEventListener('momai_init_progress', handleInitProgress)
  }, [])

  const changeMode = async (mode: string) => {
    if (mode === localMode) return
    window.dispatchEvent(new CustomEvent('ai_model_change_start', { detail: mode }))
    setLocalMode(mode)
    setIsUpdating(true)
    try {
      await updateMode(mode)
    } catch (error) {
      console.error('Erro ao trocar modo:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    let statusInterval: NodeJS.Timeout
    let initInterval: NodeJS.Timeout

    const startPolling = () => {
      checkStatus()
      const pollInterval = isBooting ? 2000 : 8000
      statusInterval = setInterval(checkStatus, pollInterval)
    }

    if (isBooting && initProgress < 100 && !hasReceivedWSEvent) {
      initInterval = setInterval(checkInitProgress, 2000)
    }

    startPolling()
    return () => {
      clearInterval(statusInterval)
      if (initInterval) clearInterval(initInterval)
    }
  }, [checkStatus, checkInitProgress, isBooting, initProgress, hasReceivedWSEvent])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    hasUpdate,
    initMessage,
    initProgress,
    isReady,
    isBooting,
    refreshStatus: checkStatus,
    changeMode
  }
}
