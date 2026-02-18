import { BrowserWindow, screen, shell, ipcMain, Menu, nativeImage, app, Tray, Notification } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { state, setMainWindow, setOverlayWindow, setTray, setIpcHandlersRegistered } from './state'
import { logger } from './logger'

export function registerIpcHandlers(): void {
  if (state.ipcHandlersRegistered) return
  setIpcHandlersRegistered(true)

  ipcMain.on('window-minimize', () => {
    state.mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return
    if (state.mainWindow.isMaximized()) {
      state.mainWindow.unmaximize()
    } else {
      state.mainWindow.maximize()
    }
  })

  ipcMain.on('window-close', () => app.quit())

  ipcMain.on('show-notification', (_, { title, body }) => {
    new Notification({
      title,
      body,
      icon: join(__dirname, '../../resources/icon.png')
    }).show()
  })

  ipcMain.handle('get-window-state', () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      return { minimized: false, visible: false }
    }
    return {
      minimized: state.mainWindow.isMinimized(),
      visible: state.mainWindow.isVisible()
    }
  })

  ipcMain.on('open-overlay', (_, data) => {
    if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
      createOverlayWindow()
    }

    if (state.overlayWindow) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width } = primaryDisplay.workAreaSize
      state.overlayWindow.setPosition(width - 480, 50)
      state.overlayWindow.showInactive()
      state.overlayWindow.webContents.send('update-overlay-content', data)
    }
  })

  ipcMain.on('close-overlay', () => {
    if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
      state.overlayWindow.hide()
    }
  })

  ipcMain.on('overlay-action', (_, action) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return
    state.mainWindow.webContents.send('trigger-action', action)
  })

  ipcMain.on('app-ready', () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return
    state.mainWindow.setResizable(true)
    state.mainWindow.setMinimumSize(450, 670)
    state.mainWindow.maximize()
  })
}

export function createOverlayWindow(): void {
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    return
  }

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

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 540,
    show: false,
    frame: false,
    resizable: false,
    center: true,
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')) } : {}),
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

  setupTray(mainWindow)
  setupContextMenu(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function setupTray(window: BrowserWindow): void {
  if (state.tray) return

  const iconPath = join(__dirname, '../../resources/icon.png')
  const tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('MomAI')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir',
      click: () => {
        window.show()
        window.focus()
      }
    },
    {
      label: 'Sair',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (window.isVisible()) {
      window.hide()
    } else {
      window.show()
      window.focus()
    }
  })

  setTray(tray)
}

function setupContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const contextMenuTemplate: Electron.MenuItemConstructorOptions[] = []

    if (params.selectionText) {
      contextMenuTemplate.push(
        { label: 'Copiar', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { type: 'separator' }
      )
    }

    contextMenuTemplate.push(
      { label: 'Recortar', role: 'cut', accelerator: 'CmdOrCtrl+X' },
      { label: 'Colar', role: 'paste', accelerator: 'CmdOrCtrl+V' },
      { type: 'separator' },
      { label: 'Selecionar Tudo', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
    )

    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
    contextMenu.popup()
  })
}

export function createWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.show()
    state.mainWindow.focus()
    state.mainWindow.maximize()
    return
  }
  createMainWindow()
}

export function showOrCreateWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.show()
    state.mainWindow.focus()
    state.mainWindow.maximize()
    return
  }
  createMainWindow()
}
