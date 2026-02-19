import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  minimize: (): void => electronAPI.ipcRenderer.send('window-minimize'),
  maximize: (): void => electronAPI.ipcRenderer.send('window-maximize'),
  close: (): void => electronAPI.ipcRenderer.send('window-close'),
  getLogsPath: (): Promise<string> => electronAPI.ipcRenderer.invoke('get-logs-path'),
  openLogsFolder: (): Promise<void> => electronAPI.ipcRenderer.invoke('open-logs-folder'),
  onBootstrapError: (
    callback: (error: { type: string; message: string; details?: string }) => void
  ) => {
    const handler = (_: any, error: { type: string; message: string; details?: string }) =>
      callback(error)
    electronAPI.ipcRenderer.on('bootstrap-error', handler)
    return () => electronAPI.ipcRenderer.removeListener('bootstrap-error', handler)
  },
  onInitProgress: (callback: (data: { message: string; progress: number }) => void) => {
    const handler = (_: any, data: { message: string; progress: number }) => callback(data)
    electronAPI.ipcRenderer.on('init-progress', handler)
    return () => electronAPI.ipcRenderer.removeListener('init-progress', handler)
  },
  onBackendOnline: (callback: () => void) => {
    const handler = () => callback()
    electronAPI.ipcRenderer.on('backend-online', handler)
    return () => electronAPI.ipcRenderer.removeListener('backend-online', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
