import { BrowserWindow, Tray } from 'electron'

export type BootstrapErrorType =
  | 'python_not_found'
  | 'uv_not_found'
  | 'venv_failed'
  | 'sync_failed'
  | 'permission_denied'
  | 'startup_failed'
  | 'missing_vc_redist'
  | 'unknown'

export interface BootstrapError {
  type: BootstrapErrorType
  message: string
  details?: string
}

export interface AppState {
  pythonProcess: ReturnType<typeof import('child_process').spawn> | null
  tray: Tray | null
  mainWindow: BrowserWindow | null
  overlayWindow: BrowserWindow | null
  isQuitting: boolean
  pythonStartTime: number
  ipcHandlersRegistered: boolean
  lastBootstrapError: BootstrapError | null
}

export const state: AppState = {
  pythonProcess: null,
  tray: null,
  mainWindow: null,
  overlayWindow: null,
  isQuitting: false,
  pythonStartTime: 0,
  ipcHandlersRegistered: false,
  lastBootstrapError: null
}

export function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return state.overlayWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  state.mainWindow = win
}

export function setOverlayWindow(win: BrowserWindow | null): void {
  state.overlayWindow = win
}

export function setPythonProcess(proc: AppState['pythonProcess']): void {
  state.pythonProcess = proc
}

export function setTray(t: Tray | null): void {
  state.tray = t
}

export function setIsQuitting(value: boolean): void {
  state.isQuitting = value
}

export function setPythonStartTime(time: number): void {
  state.pythonStartTime = time
}

export function setIpcHandlersRegistered(value: boolean): void {
  state.ipcHandlersRegistered = value
}
