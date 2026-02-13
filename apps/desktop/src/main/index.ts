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
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'

let pythonProcess: ChildProcess | null = null
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let appQuitting = false
let pythonStartTime: number = 0
let ipcHandlersRegistered = false
let quitHandled = false

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env,
      stdio: 'pipe'
    })

    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (data) => {
      process.stdout.write(`[Bootstrap] ${data}`)
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (data) => {
      stderr += data
      process.stderr.write(`[Bootstrap Error] ${data}`)
    })

    child.on('error', (err) => {
      rejectPromise(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`Comando falhou (${command} ${args.join(' ')}) com código ${code}. ${stderr}`))
    })
  })
}

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
  const isDev = Boolean(is.dev && process.env['ELECTRON_RENDERER_URL'])

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
      await runProcess(uvExe, ['venv', venvPath, '--python', '3.12'], process.env)
      console.log('[Bootstrap] Venv criado.')
    } catch (err) {
      console.error('[Bootstrap] Erro crítico ao criar venv:', err)
      throw err
    }
  }

  try {
    const syncStampPath = join(venvPath, '.momai_core_sync.stamp')
    const pyprojectPath = join(corePath, 'pyproject.toml')
    const forceSync = process.env['MOMAI_FORCE_SYNC_DEPS'] === '1'
    let shouldSyncDependencies = forceSync

    if (!isDev || forceSync) {
      shouldSyncDependencies = true
      if (!forceSync && existsSync(syncStampPath) && existsSync(pyprojectPath)) {
        const syncStampMtime = statSync(syncStampPath).mtimeMs
        const pyprojectMtime = statSync(pyprojectPath).mtimeMs
        shouldSyncDependencies = syncStampMtime < pyprojectMtime
      }
    }

    if (shouldSyncDependencies) {
      console.log('[Bootstrap] Sincronizando dependências do core...')
      await runProcess(uvExe, ['pip', 'install', '--python', pythonExe, '-e', corePath], {
        ...process.env,
        VIRTUAL_ENV: venvPath
      })
      writeFileSync(syncStampPath, new Date().toISOString(), 'utf8')
      console.log('[Bootstrap] Dependências sincronizadas com sucesso.')
    } else {
      console.log(
        '[Bootstrap] Modo dev: sync de dependências pulado (use MOMAI_FORCE_SYNC_DEPS=1 para forçar).'
      )
    }
  } catch (err: any) {
    console.error('[Bootstrap] Erro ao sincronizar dependências:')
    console.error(err?.message ?? err)
  }

  return { pythonExe, corePath, uvExe, venvPath }
}

async function checkBackendRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:8000/status', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
}

async function startPythonBackend(): Promise<void> {
  const isExternalBackend = process.env.MOMAI_EXTERNAL_BACKEND === '1'
  
  if (isExternalBackend) {
    console.log('[Electron] Modo externo: verificando se backend já está rodando...')
    const running = await checkBackendRunning()
    if (running) {
      console.log('[Electron] Backend externo detectado na porta 8000.')
      return
    }
    console.warn('[Electron] MOMAI_EXTERNAL_BACKEND=1 mas backend não encontrado na porta 8000.')
    console.warn('[Electron] Iniciando bootstrap automático...')
  }

  const alreadyRunning = await checkBackendRunning()
  if (alreadyRunning) {
    console.log('[Electron] Backend já está rodando na porta 8000. Pulando bootstrap.')
    return
  }

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
  if (process.platform !== 'win32') return
  
  const processes = ['llama-server.exe', 'llama-server', 'python.exe', 'python3.exe']
  
  for (const proc of processes) {
    try {
      execSync(`taskkill /f /im ${proc}`, { stdio: 'ignore' })
    } catch {
      // Silent - process may not exist
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function isProcessRunning(pid: number): Promise<boolean> {
  if (!pid || process.platform !== 'win32') {
    return pythonProcess !== null && !pythonProcess.killed && pythonProcess.exitCode === null
  }
  try {
    execSync(`tasklist /fi "PID eq ${pid}"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function waitForPythonExit(timeoutMs: number): Promise<boolean> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (!pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null) {
      return true
    }
    if (process.platform === 'win32' && pythonProcess.pid) {
      const running = await isProcessRunning(pythonProcess.pid)
      if (!running) {
        pythonProcess = null
        return true
      }
    }
    await delay(100)
  }

  return !pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null
}

function monitorPythonProcess(): void {
  if (!pythonProcess || !pythonProcess.pid) return

  const monitorInterval = setInterval(async () => {
    if (!pythonProcess || pythonProcess.killed || pythonProcess.exitCode !== null) {
      clearInterval(monitorInterval)
      pythonProcess = null
      return
    }

    const pid = pythonProcess.pid
    if (!pid) return
    
    const isAlive = await isProcessRunning(pid)
    if (!isAlive) {
      console.log('[Electron] Python processo detectado como encerrado pelo monitor.')
      clearInterval(monitorInterval)
      pythonProcess = null
      return
    }

    if (
      appQuitting &&
      Date.now() - pythonStartTime > 3000 &&
      pythonProcess &&
      !pythonProcess.killed
    ) {
      console.warn('[Electron] Python ainda vivo 3s após shutdown signal. Force-killing...')
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
  }, 500)
}

async function killPythonBackend(): Promise<void> {
  if (!pythonProcess || !pythonProcess.pid) {
    console.log('[Electron] Python process não está rodando.')
    return
  }

  const pid = pythonProcess.pid
  console.log(`[Electron] Iniciando shutdown de Python (PID ${pid})...`)

  try {
    console.log('[Electron] Fase 1: Tentando shutdown via API do Node...')
    pythonProcess.kill()
    
    if (await waitForPythonExit(2000)) {
      console.log('[Electron] ✓ Python encerrado graciosamente.')
      pythonProcess = null
      return
    }

    console.log('[Electron] Fase 2: Force-kill com taskkill...')

    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' })
      } catch {}
    } else {
      pythonProcess.kill('SIGKILL')
    }

    await delay(500)

    if (process.platform === 'win32') {
      const running = await isProcessRunning(pid)
      if (running) {
        console.log('[Electron] Fase 3: Tentando taskkill /im python.exe...')
        try {
          execSync('taskkill /f /im python.exe /t', { stdio: 'ignore' })
          execSync('taskkill /f /im python3.exe /t', { stdio: 'ignore' })
        } catch {}
      }
    }

    if (await waitForPythonExit(2000)) {
      console.log('[Electron] ✓ Python encerrado por force-kill.')
      pythonProcess = null
      return
    }

    console.warn('[Electron] Python não encerrou completamente.')
  } catch (err) {
    console.error('[Electron] Erro durante shutdown de Python:', err)
  } finally {
    pythonProcess = null
  }
}

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  ipcMain.handle('check-backend', async () => {
    return await checkBackendRunning()
  })

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
