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
      onBootstrapError: (callback: (error: { type: string; message: string; details?: string }) => void) => () => void
    }
  }
}
