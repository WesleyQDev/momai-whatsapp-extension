import { useState, useEffect, useCallback } from 'react'
import { StatusData, fetchStatus, updateMode, fetchExtensions } from '../services/api'

export interface InitSteps {
  api: 'pending' | 'ok' | 'error'
  socket: 'pending' | 'ok' | 'error'
  extensions: 'pending' | 'ok' | 'error'
  brain: 'pending' | 'ok' | 'error'
}

export function useStatus() {
  const [statusInfo, setStatusInfo] = useState<StatusData | null>(null)
  const [localMode, setLocalMode] = useState<string>('waiting')
  const [isOnline, setIsOnline] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [initSteps, setInitSteps] = useState<InitSteps>({
    api: 'pending',
    socket: 'pending',
    extensions: 'pending',
    brain: 'pending'
  })

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatusInfo(data)
      setLocalMode(data.mode)
      setIsOnline(data.status === 'ok')
      
      setInitSteps(prev => ({ 
        ...prev, 
        api: 'ok',
        brain: (data.mode !== 'waiting' && data.mode !== 'initial') ? 'ok' : 'pending'
      }))

      // Check extensions
      if (initSteps.extensions === 'pending') {
        const exts = await fetchExtensions()
        if (exts) setInitSteps(prev => ({ ...prev, extensions: 'ok' }))
      }

      if (data.setup.local_installed && data.setup.installed_version && data.setup.latest_version) {
        setHasUpdate(data.setup.installed_version !== data.setup.latest_version)
      }
    } catch (error) {
      console.error('Erro ao buscar status:', error)
      setStatusInfo(null)
      setIsOnline(false)
      setInitSteps(prev => ({ ...prev, api: 'pending' }))
    }
  }, [initSteps.extensions])

  // Listener para o socket (disparado pelo useChat via Event)
  useEffect(() => {
    const handleSocket = () => setInitSteps(prev => ({ ...prev, socket: 'ok' }))
    window.addEventListener('momai_socket_connected', handleSocket)
    return () => window.removeEventListener('momai_socket_connected', handleSocket)
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
    initSteps,
    refreshStatus: checkStatus,
    changeMode
  }
}
