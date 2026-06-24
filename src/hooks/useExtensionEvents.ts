import { useEffect, useRef, useCallback } from 'react'
import { API_URL } from 'momai:constants'

interface ExtensionEvent {
  eventType: string
  data: any
}

interface UseExtensionEventsOptions {
  onEvent: (event: ExtensionEvent) => void
  enabled?: boolean
}

export function useExtensionEvents({ onEvent, enabled = true }: UseExtensionEventsOptions) {
  const sourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const connect = useCallback(function connectFn() {
    if (sourceRef.current) return

    const source = new EventSource(`${API_URL}/extensions/events`)
    sourceRef.current = source

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'extension_event') {
          onEventRef.current({ eventType: data.eventType, data: data.data })
        }
      } catch (err) {
        console.error('[ExtensionEvents] Parse error:', err)
      }
    }

    source.onerror = () => {
      source.close()
      sourceRef.current = null
      setTimeout(connectFn, 3000)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }
    return disconnect
  }, [enabled, connect, disconnect])
}
