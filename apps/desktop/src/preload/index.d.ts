import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
      maximize: () => void
      close: () => void
      getLogsPath: () => Promise<string>
      openLogsFolder: () => Promise<void>
      getAppVersion: () => Promise<string>
      onBootstrapError: (
        callback: (error: { type: string; message: string; details?: string }) => void
      ) => () => void
      onInitProgress: (callback: (data: { message: string; progress: number }) => void) => () => void
      onBackendOnline: (callback: () => void) => () => void
      checkForUpdates: () => Promise<any>
      downloadUpdate: () => Promise<any>
      quitAndInstallUpdate: () => Promise<void>
      onUpdateAvailable: (callback: (info: any) => void) => () => void
      onUpdateProgress: (callback: (progress: any) => void) => () => void
      onUpdateDownloaded: (callback: (info: any) => void) => () => void
      onUpdateError: (callback: (error: string) => void) => () => void
    }
  }
}
