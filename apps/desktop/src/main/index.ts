import { app, globalShortcut, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { state, setIsQuitting } from './state'
import { registerIpcHandlers, createWindow, showOrCreateWindow } from './windowManager'
import { startPythonBackend, shutdownPython } from './pythonManager'

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showOrCreateWindow()
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wesleyqdev.momai')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
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

  console.log('[Electron] will-quit event triggered. Iniciando shutdown...')
  globalShortcut.unregisterAll()

  await shutdownPython()

  console.log('[Electron] Shutdown completo.')
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
