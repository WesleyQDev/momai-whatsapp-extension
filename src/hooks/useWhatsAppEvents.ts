import { useEffect, useCallback } from 'react'
import { useExtensionEvents } from './useExtensionEvents'

export interface WhatsAppEvent {
  eventType: string
  data?: any
}

export function useWhatsAppEvents(handlers: {
  onQrCode?: (qr: string, expiresIn: number) => void
  onAuthenticated?: (status: string, data?: any) => void
  onConnectionStatus?: (status: string, data?: any) => void
  onContactsSynced?: (count: number, isFinal: boolean) => void
  onHistoryLoaded?: (count: number) => void
  onMessage?: (data: any) => void
}) {
  useExtensionEvents({
    onEvent: useCallback(
      (event: WhatsAppEvent) => {
        switch (event.eventType) {
          case 'qr_code':
            handlers.onQrCode?.(event.data?.qr, event.data?.expiresIn)
            break
          case 'authenticated':
            handlers.onAuthenticated?.(event.data?.status, event.data)
            break
          case 'connection_status':
            handlers.onConnectionStatus?.(event.data?.status, event.data)
            break
          case 'contacts_synced':
            handlers.onContactsSynced?.(event.data?.count, event.data?.isFinal)
            break
          case 'history_loaded':
            handlers.onHistoryLoaded?.(event.data?.count)
            break
          case 'whatsapp_message':
            handlers.onMessage?.(event.data)
            break
        }
      },
      [handlers]
    )
  })
}
