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
let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let appQuitting = false
let pythonStartTime: number = 0

// ... (bootstrapPython code)

function createOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return
  }

  overlayWindow = new BrowserWindow({
    width: 450,
    height: 600,
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

  // Set position to bottom right or custom
  // overlayWindow.setPosition(...)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/overlay`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }
}

async function bootstrapPython(): Promise<{
  pythonExe: string
  corePath: string
  uvExe: string
  venvPath: string
}> {
  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

  // No dev, o corePath é relativo ao projeto. No prod, é nos extraResources.
  const corePath = isDev
    ? resolve(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  // No Windows, o AppData é o lugar certo para o VENV (escrita garantida)
  const userDataPath = app.getPath('userData')
  const venvPath = join(userDataPath, 'python_env')
  const pythonExe =
    process.platform === 'win32'
      ? join(venvPath, 'Scripts', 'python.exe')
      : join(venvPath, 'bin', 'python')

  // 1. Localiza o UV (deve estar em resources/bin ou no PATH em dev)
  const uvExe = isDev
    ? 'uv'
    : join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')

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
    const dataDir = join(app.getPath('userData'), 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    console.log(`[Electron] Iniciando backend Python em: ${corePath}`)
    console.log(`[Electron] Usando executável: ${pythonExe}`)

    pythonStartTime = Date.now()
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
          MOMAI_DATA_DIR: dataDir,
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
      pythonProcess = null

      // Se não estamos saindo, isso é um crash - limpar llama-serve
      if (!appQuitting && code !== 0) {
        console.warn('[Python] Processo morreu de forma inesperada. Limpando llama-serve...')
        killAllLlamaServers()
      }
    })

    pythonProcess.on('error', (err) => {
      console.error('[Python] Erro no processo:', err)
      pythonProcess = null
    })

    // Monitorar processo para detectar travamentos
    monitorPythonProcess()
  } catch (err) {
    console.error('[Electron] Falha ao iniciar backend:', err)
  }
}

function killAllLlamaServers(): void {
  try {
    console.log('[Electron] Attempting to kill orphaned llama-server processes...')
    execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' })
    console.log('[Electron] Orphaned llama-server processes terminated.')
  } catch (err) {
    // Silent failure - llama-server may not be running
  }
}

/**
 * Monitora a vida útil do processo Python com timeout e fallback.
 * Se Python não morrer em X segundos, força kill com escalação de agressividade.
 */
function monitorPythonProcess(): void {
  if (!pythonProcess || !pythonProcess.pid) return

  const monitorInterval = setInterval(() => {
    if (!pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null) {
      clearInterval(monitorInterval)
      pythonProcess = null
      return
    }

    // Se app está saindo e Python ainda vivo após 5s, força kill
    if (
      appQuitting &&
      Date.now() - pythonStartTime > 5000 &&
      pythonProcess &&
      !pythonProcess.killed
    ) {
      console.warn('[Electron] Python process ainda vivo 5s após shutdown signal. Force-killing...')
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${pythonProcess.pid} /f /t`, { stdio: 'ignore' })
        } else {
          pythonProcess.kill('SIGKILL')
        }
      } catch (e) {
        console.warn('[Electron] Erro ao force-kill Python:', e)
      }
      clearInterval(monitorInterval)
    }
  }, 1000)
}

/**
 * Abordagem à prova de falhas para encerrar Python:
 * 1. Graceful SIGTERM → espera 2s
 * 2. Force kill /f /t → espera 1s
 * 3. Nuclear option: Kill by name + llama-server cleanup
 */
function killPythonBackend(): void {
  if (!pythonProcess || !pythonProcess.pid) {
    console.log('[Electron] Python process não está rodando.')
    return
  }

  const pid = pythonProcess.pid
  console.log(`[Electron] Iniciando shutdown de Python (PID ${pid})...`)

  try {
    // FASE 1: Graceful shutdown via SIGTERM
    console.log('[Electron] Fase 1: Tentando shutdown gracioso (SIGTERM)...')
    pythonProcess.kill('SIGTERM')

    // Aguarda até 2 segundos
    const phase1End = Date.now() + 2000
    while (Date.now() < phase1End) {
      if (pythonProcess.exitCode !== null || pythonProcess.killed) {
        console.log('[Electron] ✓ Python encerrado graciosamente.')
        return
      }
      // Busy-wait com verificações frequentes
      if (Date.now() % 100 === 0) {
        // Small sleep equivalent
        try {
          execSync('timeout /t 0 /nobreak', { stdio: 'ignore', shell: 'cmd.exe' })
        } catch {}
      }
    }

    // FASE 2: Force kill com tree termination (/f /t)
    console.log('[Electron] Fase 2: Force-kill com tree termination (/f /t)...')
    execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' })

    // Aguarda até 1 segundo
    const phase2End = Date.now() + 1000
    while (Date.now() < phase2End) {
      try {
        // Tenta verificar se processo ainda existe
        execSync(`tasklist | findstr ${pid}`, { stdio: 'ignore' })
      } catch {
        // Se não encontra, já morreu
        console.log('[Electron] ✓ Python encerrado por force-kill.')
        return
      }
      if (Date.now() % 100 === 0) {
        try {
          execSync('timeout /t 0 /nobreak', { stdio: 'ignore', shell: 'cmd.exe' })
        } catch {}
      }
    }

    // FASE 3: Nuclear option - kill by name (último recurso)
    console.log('[Electron] Fase 3: Nuclear option - matando python.exe por nome...')
    execSync('taskkill /f /im python.exe', { stdio: 'ignore' })
    console.log('[Electron] ✓ Python eliminado por force (nome).')
  } catch (err) {
    console.error('[Electron] Erro durante shutdown de Python:', err)
  } finally {
    pythonProcess = null
  }
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.maximize()
    return
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 360,
    height: 240,
    show: false,
    frame: false,
    resizable: false,
    center: true,
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const window = mainWindow
  if (!window) return

  window.on('ready-to-show', () => {
    window.show()
  })

  ipcMain.on('window-minimize', () => window.minimize())
  ipcMain.on('window-maximize', () => {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
  ipcMain.on('window-close', () => app.quit())

  // Overlay IPC handlers
  ipcMain.handle('get-window-state', () => {
    return {
      minimized: window.isMinimized(),
      visible: window.isVisible()
    }
  })

  ipcMain.on('open-overlay', (_, data) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()

    // Position overlay relative to screen
    if (overlayWindow) {
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width } = primaryDisplay.workAreaSize
      // Position top right
      overlayWindow.setPosition(width - 480, 50)
      overlayWindow.showInactive() // Show without stealing focus fully? Or show()
      overlayWindow.show()
      overlayWindow.webContents.send('update-overlay-content', data)
    }
  })

  ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
    }
  })

  ipcMain.on('overlay-action', (_, action) => {
    // Forward action to main window to handle logic
    window.webContents.send('trigger-action', action)
  })

  // Transição de Splash para App principal
  ipcMain.on('app-ready', () => {
    window.setResizable(true)
    window.setMinimumSize(450, 500)
    window.setSize(900, 670, true)
    window.center()
  })

  // Tray configuration
  if (!tray) {
    const iconPath = join(__dirname, '../../resources/icon.png')
    tray = new Tray(nativeImage.createFromPath(iconPath))
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
  }

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.maximize()
      return
    }
    createWindow()
  })
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
  appQuitting = true
  console.log('[Electron] will-quit event triggered. Iniciando shutdown cascata...')
  globalShortcut.unregisterAll()

  // Fase 1: Shutdown Python (max 5s)
  console.log('[Electron] Fase 1/3: Encerrando Python...')
  killPythonBackend()

  // Fase 2: Aguarda 1s para Python limpar
  try {
    execSync('timeout /t 1 /nobreak', {
      stdio: 'ignore',
      shell: 'cmd.exe'
    })
  } catch {
    // Ignore
  }

  // Fase 3: Kill orphaned llama-servers
  console.log('[Electron] Fase 2/3: Limpando llama-servers órfãos...')
  killAllLlamaServers()

  // Fase 4: Verificação final - se ainda há python.exe, matar
  try {
    console.log('[Electron] Fase 3/3: Verificação final de processos...')
    execSync('tasklist | findstr python.exe', { stdio: 'ignore' })
    console.warn('[Electron] AVISO: Ainda existem processos python.exe. Limpando...')
    execSync('taskkill /f /im python.exe', { stdio: 'ignore' })
  } catch {
    // Não há mais processos Python - bom!
  }

  console.log('[Electron] ✓ Shutdown completo.')
})

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
