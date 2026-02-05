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
  const [initVersion, setInitVersion] = useState<string>('v0.0.0')
  const [isBooting, setIsBooting] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [hasReceivedWSEvent, setHasReceivedWSEvent] = useState(false)

  const isReady = initProgress >= 100 && !isBooting

  // Polling de fallback para progresso de init (caso WebSocket demore)
  const checkInitProgress = useCallback(async () => {
    if (hasReceivedWSEvent || initProgress >= 100) return
    
    try {
      const data = await (fetchInitStatus() as any)
      
      setInitMessage(data.message)
      setInitProgress(data.progress)
      if (data.version) setInitVersion(data.version)
      
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
      
      // Se o status da API está OK, garantimos que o boot terminou
      if (data.status === 'ok') {
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
      setRetryCount(prev => prev + 1)
    }
  }, [isBooting, retryCount])

  useEffect(() => {
    const handleInitProgress = (e: any) => {
      const { message, progress, version } = e.detail
      setHasReceivedWSEvent(true)
      setInitMessage(message)
      setInitProgress(progress)
      if (version) setInitVersion(version)

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
      const pollInterval = isBooting ? 1000 : 5000
      statusInterval = setInterval(checkStatus, pollInterval)
    }
    
    if (isBooting && initProgress < 100) {
      initInterval = setInterval(checkInitProgress, 500)
    }
    
    startPolling()
    return () => {
      clearInterval(statusInterval)
      if (initInterval) clearInterval(initInterval)
    }
  }, [checkStatus, checkInitProgress, isBooting, initProgress])

  return {
    statusInfo,
    localMode,
    isOnline,
    isUpdating,
    hasUpdate,
    initMessage,
    initProgress,
    initVersion,
    isReady,
    isBooting,
    refreshStatus: checkStatus,
    changeMode
  }
}
