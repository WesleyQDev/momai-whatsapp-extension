import { BrowserWindow, Tray } from 'electron'

export interface AppState {
  pythonProcess: ReturnType<typeof import('child_process').spawn> | null
  tray: Tray | null
  mainWindow: BrowserWindow | null
  overlayWindow: BrowserWindow | null
  isQuitting: boolean
  pythonStartTime: number
  ipcHandlersRegistered: boolean
}

export const state: AppState = {
  pythonProcess: null,
  tray: null,
  mainWindow: null,
  overlayWindow: null,
  isQuitting: false,
  pythonStartTime: 0,
  ipcHandlersRegistered: false
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
