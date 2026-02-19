import {
  BrowserWindow,
  screen,
  shell,
  ipcMain,
  Menu,
  nativeImage,
  app,
  Tray,
  Notification
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  state,
  setMainWindow,
  setOverlayWindow,
  setTray,
  setIpcHandlersRegistered,
  setIsQuitting
} from './state'
import { logger } from './logger'
import { shutdownPython, startPythonBackend } from './pythonManager'

const ICON_PATH = join(__dirname, '../../resources/icon.png')

function getMainWindow(): BrowserWindow | null {
  return state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : null
}

export function registerIpcHandlers(): void {
  if (state.ipcHandlersRegistered) return
  setIpcHandlersRegistered(true)

  ipcMain.on('window-minimize', () => {
    getMainWindow()?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    setIsQuitting(true)
    app.quit()
  })

  ipcMain.on('show-notification', (_, { title, body }) => {
    if (!Notification.isSupported()) return
    new Notification({
      title,
      body,
      icon: ICON_PATH
    }).show()
  })

  ipcMain.handle('get-window-state', () => {
    const win = getMainWindow()
    if (!win) {
      return { minimized: false, visible: false }
    }
    return {
      minimized: win.isMinimized(),
      visible: win.isVisible()
    }
  })

  ipcMain.on('open-overlay', (_, data) => {
    createOverlayWindow(data)
  })

  ipcMain.on('close-overlay', () => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      state.overlayWindow.hide()
    }
  })

  ipcMain.on('overlay-action', (_, action) => {
    const win = getMainWindow()
    if (!win) return
    win.webContents.send('trigger-action', action)
  })

  ipcMain.on('app-ready', () => {
    const win = getMainWindow()
    if (!win) return
    win.setResizable(true)
    win.setMinimumSize(450, 670)
    win.maximize()
  })
}

export function createOverlayWindow(data?: any): void {
  let isNew = false

  if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
    isNew = true
    const overlayWindow = new BrowserWindow({
      width: 450,
      height: 670,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    setOverlayWindow(overlayWindow)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/overlay`)
    } else {
      overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
    }
  }

  const overlayWin = state.overlayWindow
  if (overlayWin) {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width } = primaryDisplay.workAreaSize
    overlayWin.setPosition(width - 480, 50)
    overlayWin.showInactive()

    const sendData = (): void => {
      if (data) overlayWin.webContents.send('update-overlay-content', data)
    }

    if (isNew || overlayWin.webContents.isLoading()) {
      overlayWin.webContents.once('did-finish-load', sendData)
    } else {
      sendData()
    }
  }
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 540,
    show: false,
    frame: false,
    resizable: false,
    center: true,
    icon: ICON_PATH,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? { icon: nativeImage.createFromPath(ICON_PATH) }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    if (state.lastBootstrapError) {
      logger.info('[WindowManager] Sending pending bootstrap error to renderer')
      mainWindow.webContents.send('bootstrap-error', state.lastBootstrapError)
    }
  })

  setupTray()
  setupContextMenu()

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Tratamento de CTRL+R: em dev reinicia frontend+backend, em prod bloqueia
  mainWindow.webContents.on('before-input-event', async (event, input) => {
    // CTRL+R ou F5
    const isReloadKey = (input.control && input.key.toLowerCase() === 'r') || input.key === 'F5'
    const isHardReload = input.control && input.shift && input.key.toLowerCase() === 'r'

    if (isReloadKey || isHardReload) {
      event.preventDefault()

      if (is.dev) {
        // Em desenvolvimento: reinicia o backend Python e recarrega o frontend
        logger.info(
          '[WindowManager] CTRL+R detectado em modo DEV - reiniciando backend e frontend...'
        )
        try {
          await shutdownPython()
          // Reset do estado para permitir reinicialização
          setIsQuitting(false)
          logger.info('[WindowManager] Backend Python encerrado, iniciando novamente...')
          await startPythonBackend()
          logger.info('[WindowManager] Backend Python reiniciado, recarregando frontend...')
          mainWindow.webContents.reload()
        } catch (error) {
          logger.error('[WindowManager] Erro ao reiniciar backend:', error)
          mainWindow.webContents.reload()
        }
      } else {
        // Em produção: apenas bloqueia o reload para evitar loop de splash
        logger.info('[WindowManager] CTRL+R bloqueado em modo produção')
      }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function setupTray(): void {
  if (state.tray) return

  const tray = new Tray(nativeImage.createFromPath(ICON_PATH))
  tray.setToolTip('MomAI')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    {
      label: 'Sair',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = getMainWindow()
    if (!win) return

    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })

  setTray(tray)
}

function setupContextMenu(): void {
  const win = getMainWindow()
  if (!win) return

  win.webContents.on('context-menu', (_event, params) => {
    const contextMenuTemplate: Electron.MenuItemConstructorOptions[] = []

    if (params.selectionText) {
      contextMenuTemplate.push(
        { label: 'Copiar', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { type: 'separator' }
      )
    }

    if (params.isEditable) {
      contextMenuTemplate.push(
        { label: 'Recortar', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'Colar', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { type: 'separator' }
      )
    }

    contextMenuTemplate.push({
      label: 'Selecionar Tudo',
      role: 'selectAll',
      accelerator: 'CmdOrCtrl+A'
    })

    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
    contextMenu.popup()
  })
}

export function createWindow(): void {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.maximize()
    return
  }
  createMainWindow()
}

export function toggleWindow(): void {
  const win = getMainWindow()
  if (win) {
    if (win.isVisible() && win.isFocused()) {
      win.hide()
    } else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.setSize(450, 670)
      win.center()
      win.webContents.send('focus-input')
    }
  } else {
    createWindow()
  }
}
