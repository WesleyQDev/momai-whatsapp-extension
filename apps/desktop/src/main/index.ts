import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, execSync, type ChildProcess } from 'child_process'
import icon from '../../resources/icon.png?asset'

let pythonProcess: ChildProcess | null = null
let tray: Tray | null = null

function startPythonBackend(): void {
  // Localiza o caminho para apps/core baseado na estrutura do projeto
  // app.getAppPath() no dev aponta para a raiz do apps/desktop
  const corePath = resolve(app.getAppPath(), '..', 'core')

  const pythonExe =
    process.platform === 'win32'
      ? join(corePath, '.venv', 'Scripts', 'python.exe')
      : join(corePath, '.venv', 'bin', 'python')

  console.log(`[Electron] Iniciando backend Python em: ${corePath}`)
  console.log(`[Electron] Usando executável: ${pythonExe}`)

  // Executamos o uvicorn como um módulo do python do venv para garantir o uso das dependências instaladas
  pythonProcess = spawn(
    pythonExe,
    ['-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: corePath,
      shell: false,
      stdio: 'pipe'
    }
  )

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Python]: ${data.toString().trim()}`)
  })

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Python PDF]: ${data.toString().trim()}`)
  })

  pythonProcess.on('close', (code) => {
    console.log(`[Python] Processo encerrado com código ${code}`)
  })
}

function killPythonBackend(): void {
  if (pythonProcess && pythonProcess.pid) {
    try {
      if (process.platform === 'win32') {
        // Usamos execSync para garantir que o comando termine antes do Electron fechar.
        // O /T garante que mate toda a árvore de processos (incluindo workers do uvicorn).
        execSync(`taskkill /pid ${pythonProcess.pid} /f /t`)
      } else {
        pythonProcess.kill('SIGTERM')
      }
    } catch (err) {
      console.error('[Electron] Erro ao encerrar processo Python:', err)
    }
    pythonProcess = null
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 450,
    minHeight: 500,
    show: false,
    frame: false,
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('minimize', (event: Event) => {
    event.preventDefault()
    mainWindow.hide()
  })

  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow.hide())

  // Tray configuration
  if (!tray) {
    const iconPath = join(__dirname, '../../resources/icon.png')
    tray = new Tray(nativeImage.createFromPath(iconPath))
    tray.setToolTip('MomAI')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        }
      },
      {
        label: 'Sair',
        click: () => app.quit()
      }
    ])

    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  startPythonBackend() // Inicia o Python
  createWindow()

  // Register a 'CommandOrControl+Shift+Space' shortcut listener.
  globalShortcut.register('Alt+Space', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isVisible() && win.isFocused()) {
        win.hide()
      } else {
        // Mini Mode on toggle
        win.setSize(500, 600)
        win.center()
        win.show()
        win.focus()
      }
    } else {
      createWindow()
    }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  killPythonBackend()
}) // Garante que o Python morra ao fechar e limpa atalhos

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
