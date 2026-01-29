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
import { existsSync, mkdirSync } from 'fs'
import icon from '../../resources/icon.png?asset'

let pythonProcess: ChildProcess | null = null
let tray: Tray | null = null

async function bootstrapPython(): Promise<{ pythonExe: string; corePath: string; uvExe: string; venvPath: string }> {
  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']
  
  // No dev, o corePath é relativo ao projeto. No prod, é nos extraResources.
  const corePath = isDev 
    ? resolve(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  // No Windows, o AppData é o lugar certo para o VENV (escrita garantida)
  const userDataPath = app.getPath('userData')
  const venvPath = join(userDataPath, 'python_env')
  const pythonExe = process.platform === 'win32'
    ? join(venvPath, 'Scripts', 'python.exe')
    : join(venvPath, 'bin', 'python')

  // 1. Localiza o UV (deve estar em resources/bin ou no PATH em dev)
  const uvExe = isDev ? 'uv' : join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')

  console.log(`[Bootstrap] Verificando ambiente em: ${venvPath}`)

  if (!existsSync(pythonExe)) {
    console.log('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

    try {
      // Cria o venv usando o uv e a versão 3.12 (uv cuida de baixar o python-build-standalone)
      execSync(`"${uvExe}" venv "${venvPath}" --python 3.12`, { stdio: 'inherit' })
      console.log('[Bootstrap] Venv criado. Sincronizando dependências...')
      
      // Sincroniza o core com o venv
      execSync(`"${uvExe}" pip install -e "${corePath}"`, { 
        env: { ...process.env, VIRTUAL_ENV: venvPath },
        stdio: 'inherit' 
      })
    } catch (err) {
      console.error('[Bootstrap] Erro crítico no setup:', err)
      throw err
    }
  }

  return { pythonExe, corePath, uvExe, venvPath }
}

async function startPythonBackend(): Promise<void> {
  try {
    const { pythonExe, corePath, uvExe, venvPath } = await bootstrapPython()

    console.log(`[Electron] Iniciando backend Python em: ${corePath}`)
    console.log(`[Electron] Usando executável: ${pythonExe}`)

    pythonProcess = spawn(
      pythonExe,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
      {
        cwd: corePath,
        shell: false,
        stdio: 'pipe',
        env: {
          ...process.env,
          VIRTUAL_ENV: venvPath,
          MOMAI_UV_BIN: uvExe,
          FORCE_COLOR: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          PYTHONLEGACYWINDOWSSTDIO: '0',
          LC_ALL: 'pt_BR.UTF-8',
          TERM: 'xterm-256color'
        }
      }
    )

    pythonProcess.stdout?.setEncoding('utf8')
    pythonProcess.stdout?.on('data', (data) => {
      process.stdout.write(`[Python]: ${data}`)
    })

    pythonProcess.stderr?.setEncoding('utf8')
    pythonProcess.stderr?.on('data', (data) => {
      process.stderr.write(`[Python Error]: ${data}`)
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Python] Processo encerrado com código ${code}`)
    })
  } catch (err) {
    console.error('[Electron] Falha ao iniciar backend:', err)
  }
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

  mainWindow.on('minimize' as any, (event) => {
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
  ipcMain.on('window-close', () => app.quit())

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
        win.show()
        win.focus()

        // Refined Mini Size for Spotlight effect
        win.setSize(500, 650)
        win.center()

        // Garante que o input receba foco
        win.webContents.send('focus-input')
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
