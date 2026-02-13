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

  const corePath = isDev
    ? resolve(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  const userDataPath = app.getPath('userData')
  const venvPath = join(userDataPath, 'python_env')
  const pythonExe =
    process.platform === 'win32'
      ? join(venvPath, 'Scripts', 'python.exe')
      : join(venvPath, 'bin', 'python')

  const uvExe = isDev
    ? 'uv'
    : join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')

  console.log(`[Bootstrap] Verificando ambiente em: ${venvPath}`)

  if (!existsSync(pythonExe)) {
    console.log('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

    try {
      execSync(`"${uvExe}" venv "${venvPath}" --python 3.12`, { stdio: 'inherit' })
      console.log('[Bootstrap] Venv criado.')
    } catch (err) {
      console.error('[Bootstrap] Erro crítico ao criar venv:', err)
      throw err
    }
  }

  try {
    console.log('[Bootstrap] Sincronizando dependências do core...')
    execSync(`"${uvExe}" pip install --no-progress -e "${corePath}"`, {
      env: { ...process.env, VIRTUAL_ENV: venvPath },
      stdio: 'pipe'
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
    const sanitizedEnv = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SystemDrive: process.env.SystemDrive,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      VIRTUAL_ENV: venvPath,
      MOMAI_DATA_DIR: dataDir,
      MOMAI_UV_BIN: uvExe,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONOPTIMIZE: '1',
      PYTHONDONTWRITEBYTECODE: '0',

      FORCE_COLOR: '1',
      LC_ALL: 'pt_BR.UTF-8'
    }

    pythonStartTime = Date.now()
    pythonProcess = spawn(pythonExe, ['main.py'], {
      cwd: corePath,
      shell: false,
      stdio: 'pipe',
      env: sanitizedEnv
    })

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
          lower.includes("couldn't access the hub")
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
      if (!appQuitting && code !== 0) {
        console.warn('[Python] Processo morreu de forma inesperada. Limpando llama-serve...')
        killAllLlamaServers()
      }
    })

    pythonProcess.on('error', (err) => {
      console.error('[Python] Erro no processo:', err)
      pythonProcess = null
    })
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

function monitorPythonProcess(): void {
  if (!pythonProcess || !pythonProcess.pid) return

  const monitorInterval = setInterval(() => {
    if (!pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null) {
      clearInterval(monitorInterval)
      pythonProcess = null
      return
    }

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

async function killPythonBackend(): Promise<void> {
  if (!pythonProcess || !pythonProcess.pid) {
    console.log('[Electron] Python process não está rodando.')
    return
  }

  const pid = pythonProcess.pid
  console.log(`[Electron] Iniciando shutdown de Python (PID ${pid})...`)

  try {
    console.log('[Electron] Fase 1: Tentando shutdown gracioso (SIGTERM)...')
    pythonProcess.kill('SIGTERM')

    if (await waitForPythonExit(2000)) {
      console.log('[Electron] ✓ Python encerrado graciosamente.')
      return
    }

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
  registerIpcHandlers()

  startPythonBackend()
  createWindow()

  globalShortcut.register('Alt+Space', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isVisible() && win.isFocused()) {
        win.hide()
      } else {
        win.show()
        win.focus()
        win.setSize(500, 650)
        win.center()
        win.webContents.send('focus-input')
      }
    } else {
      createWindow()
    }
  })

  app.on('activate', function () {
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

  console.log('[Electron] Fase 1/3: Encerrando Python...')
  await killPythonBackend()

  await delay(1000)
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
