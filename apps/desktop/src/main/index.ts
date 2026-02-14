import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen
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
let ipcHandlersRegistered = false
let quitHandled = false

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
      // Cria o venv usando o uv e a versão 3.12
      execSync(`"${uvExe}" venv "${venvPath}" --python 3.12`, { stdio: 'inherit' })
      console.log('[Bootstrap] Venv criado.')
    } catch (err) {
      console.error('[Bootstrap] Erro crítico ao criar venv:', err)
      throw err
    }
  }

  // SEMPRE tenta sincronizar as dependências (uv é rápido o suficiente para isso)
  // Isso garante que mudanças no pyproject.toml sejam aplicadas automaticamente
  try {
    console.log('[Bootstrap] Sincronizando dependências do core...')
    // Usamos --no-progress para evitar logs quebrados no terminal do Electron
    // E capturamos o output caso ocorra erro
    execSync(`"${uvExe}" pip install --no-progress -e "${corePath}"`, {
      env: { ...process.env, VIRTUAL_ENV: venvPath },
      stdio: 'pipe' // Pipe para evitar o garbled output das animações do UV
    })
    console.log('[Bootstrap] Dependências sincronizadas com sucesso.')
  } catch (err: any) {
    console.error('[Bootstrap] Erro ao sincronizar dependências:')
    if (err.stdout) console.error(err.stdout.toString())
    if (err.stderr) console.error(err.stderr.toString())
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
    
    // Otimização: Passar apenas o essencial no env para acelerar o spawn
    const sanitizedEnv = {
      // Sistema Básicos
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SystemDrive: process.env.SystemDrive,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      // MomAI Específicos
      VIRTUAL_ENV: venvPath,
      MOMAI_DATA_DIR: dataDir,
      MOMAI_UV_BIN: uvExe,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONOPTIMIZE: '1', // Ativa otimizações do interpretador
      PYTHONDONTWRITEBYTECODE: '0', // Queremos .pyc para startup mais rápido
      // Outros
      FORCE_COLOR: '1',
      LC_ALL: 'pt_BR.UTF-8'
    }

    pythonStartTime = Date.now()
    pythonProcess = spawn(
      pythonExe,
      ['main.py'], // Execução direta do main.py
      {
        cwd: corePath,
        shell: false,
        stdio: 'pipe',
        env: sanitizedEnv
      }
    )

    pythonProcess.stdout?.setEncoding('utf8')
    pythonProcess.stdout?.on('data', (data) => {
      process.stdout.write(`[Python]: ${data}`)
    })

    pythonProcess.stderr?.setEncoding('utf8')
    pythonProcess.stderr?.on('data', (data: string) => {
      const lines = data
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      for (const line of lines) {
        const lower = line.toLowerCase()
        if (
          lower.startsWith('info:') ||
          lower.includes('warning') ||
          lower.includes('couldn\'t access the hub')
        ) {
          process.stdout.write(`[Python]: ${line}\n`)
        } else {
          process.stderr.write(`[Python Error]: ${line}\n`)
        }
      }
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

function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      shell: false,
      windowsHide: true
    })

    child.on('close', (code) => resolvePromise(code === 0))
    child.on('error', () => resolvePromise(false))
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function waitForPythonExit(timeoutMs: number): Promise<boolean> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (!pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null) {
      return true
    }
    await delay(100)
  }

  return !pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null
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
async function killPythonBackend(): Promise<void> {
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

    if (await waitForPythonExit(2000)) {
      console.log('[Electron] ✓ Python encerrado graciosamente.')
      return
    }

    // FASE 2: Force kill com tree termination (/f /t)
    console.log('[Electron] Fase 2: Force-kill com tree termination (/f /t)...')

    if (process.platform === 'win32') {
      await runCommand('taskkill', ['/pid', String(pid), '/f', '/t'])
    } else {
      pythonProcess.kill('SIGKILL')
    }

    if (await waitForPythonExit(1000)) {
      console.log('[Electron] ✓ Python encerrado por force-kill.')
      return
    }

    console.warn('[Electron] Python não confirmou encerramento após force-kill.')
  } catch (err) {
    console.error('[Electron] Erro durante shutdown de Python:', err)
  } finally {
    pythonProcess = null
  }
}

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('window-close', () => app.quit())

  ipcMain.handle('get-window-state', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { minimized: false, visible: false }
    }
    return {
      minimized: mainWindow.isMinimized(),
      visible: mainWindow.isVisible()
    }
  })

  ipcMain.on('open-overlay', (_, data) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()

    if (overlayWindow) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width } = primaryDisplay.workAreaSize
      overlayWindow.setPosition(width - 480, 50)
      overlayWindow.showInactive()
      overlayWindow.webContents.send('update-overlay-content', data)
    }
  })

  ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
    }
  })

  ipcMain.on('overlay-action', (_, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('trigger-action', action)
  })

  ipcMain.on('app-ready', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(450, 500)
    mainWindow.setSize(900, 670, true)
    mainWindow.center()
  })
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
    width: 800,
    height: 540,
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
  registerIpcHandlers()

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

app.on('will-quit', async (event) => {
  if (quitHandled) return
  quitHandled = true
  event.preventDefault()

  appQuitting = true
  console.log('[Electron] will-quit event triggered. Iniciando shutdown cascata...')
  globalShortcut.unregisterAll()

  // Fase 1: Shutdown Python (max 5s)
  console.log('[Electron] Fase 1/3: Encerrando Python...')
  await killPythonBackend()

  // Fase 2: Aguarda 1s para Python limpar
  await delay(1000)

  // Fase 3: Kill orphaned llama-servers
  console.log('[Electron] Fase 2/3: Limpando llama-servers órfãos...')
  killAllLlamaServers()

  console.log('[Electron] ✓ Shutdown completo.')
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
