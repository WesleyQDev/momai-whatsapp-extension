import { autoUpdater } from 'electron-updater'
import { ipcMain } from 'electron'
import { getMainWindow } from './state'
import { logger } from './logger'
import { shutdownPython } from './pythonManager'
import { app } from 'electron'

export function setupUpdater(): void {
  // autoUpdater.autoDownload = false is crucial for Delta updates
  // It gives us control over when to download and show progress in React
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Redirect electron-updater logs to our logger
  autoUpdater.logger = logger

  autoUpdater.on('checking-for-update', () => {
    logger.info('[Updater] Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    logger.info(`[Updater] Update available: v${info.version}`)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info)
    }
  })

  autoUpdater.on('update-not-available', () => {
    logger.info(`[Updater] Update not available. Current version is up to date.`)
  })

  autoUpdater.on('error', (err) => {
    logger.error(`[Updater] Error in auto-updater. ${err}`)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err.message || err.toString())
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    logger.info(`[Updater] Download progress: ${progressObj.percent}%`)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progressObj)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`[Updater] Update downloaded: v${info.version}`)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info)
    }
  })

  // IPC Hooks for React Renderer
  ipcMain.handle('check-for-updates', async () => {
    try {
      if (app.isPackaged) {
        return await autoUpdater.checkForUpdates()
      } else {
        logger.info('[Updater] Dev mode: Skipping update check.')
        return null
      }
    } catch (e: any) {
      logger.error(`[Updater] check-for-updates failed: ${e}`)
      return null
    }
  })

  ipcMain.handle('download-update', async () => {
    try {
      logger.info('[Updater] Starting update download...')
      return await autoUpdater.downloadUpdate()
    } catch (e: any) {
      logger.error(`[Updater] download-update failed: ${e}`)
      return null
    }
  })

  ipcMain.handle('quit-and-install-update', async () => {
    try {
      logger.info('[Updater] Starting quit-and-install process...')
      // Graceful shutdown of python backend before installing
      await shutdownPython()
      // Wait a moment for file descriptions to release
      setTimeout(() => {
        autoUpdater.quitAndInstall()
      }, 1000)
    } catch (e: any) {
      logger.error(`[Updater] quit-and-install-update failed: ${e}`)
    }
  })

  // Check on startup if packaged
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(err => {
      logger.error(`[Updater] Initial check-for-updates failed: ${err}`)
    })
  } else {
    logger.info('[Updater] Dev mode: Skipping initial update check.')
  }
}
