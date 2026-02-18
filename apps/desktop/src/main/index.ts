import { app, globalShortcut, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { state, setIsQuitting } from './state'
import { registerIpcHandlers, createWindow, showOrCreateWindow } from './windowManager'
import { startPythonBackend, shutdownPython } from './pythonManager'
import { logger, getLogsPath } from './logger'

logger.info('[Electron] Starting MomAI...')
logger.info(`[Electron] Version: ${app.getVersion()}`)
logger.info(`[Electron] Platform: ${process.platform}`)
logger.info(`[Electron] userData: ${app.getPath('userData')}`)

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  logger.warn('[Electron] Another instance is already running, quitting...')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.info('[Electron] Second instance requested, showing window...')
    showOrCreateWindow()
  })
}

process.on('uncaughtException', (error) => {
  logger.error('[Electron] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('[Electron] Unhandled Rejection:', reason)
})

ipcMain.handle('get-logs-path', () => getLogsPath())
ipcMain.handle('open-logs-folder', () => shell.openPath(getLogsPath()))

ipcMain.on('report-bootstrap-error', (_, error: string) => {
  logger.error('[Bootstrap] Error reported from renderer:', error)
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('bootstrap-failed', error)
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wesleyqdev.momai')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => logger.info('pong'))
  registerIpcHandlers()

  createWindow()
  startPythonBackend()

  globalShortcut.register('Alt+Space', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isVisible() && win.isFocused()) {
        win.hide()
      } else {
        win.show()
        win.focus()
        win.setSize(450, 670)
        win.center()
        win.webContents.send('focus-input')
      }
    } else {
      createWindow()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', async (event) => {
  if (state.isQuitting) return
  setIsQuitting(true)
  event.preventDefault()

  logger.info('[Electron] will-quit event triggered. Iniciando shutdown...')
  globalShortcut.unregisterAll()

  await shutdownPython()

  logger.info('[Electron] Shutdown completo.')
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
