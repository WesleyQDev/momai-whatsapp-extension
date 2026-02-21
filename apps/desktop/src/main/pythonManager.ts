import { app } from 'electron'
import { spawn, execSync } from 'child_process'
import { join, resolve } from 'path'
import { createConnection } from 'net'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs'
import {
  state,
  setPythonProcess,
  setPythonStartTime,
  setIsQuitting,
  getMainWindow,
  BootstrapError,
  BootstrapErrorType
} from './state'
import { is } from '@electron-toolkit/utils'
import { logger } from './logger'

const userDataPath = app.getPath('userData')
const SYNC_LOCK_FILE = join(userDataPath, '.sync.lock')
const INIT_PROGRESS_REGEX = /\[Init (\d+)%\]\s+[^:]+:\s+(.+)/

interface BootstrapResult {
  pythonExe: string
  corePath: string
  uvExe: string
  venvPath: string
}

interface SyncResult {
  success: boolean
  needsSync: boolean
  lastChecked?: number
}

function sendErrorToRenderer(error: BootstrapError): void {
  logger.error(`[Bootstrap] Error: ${error.type} - ${error.message}`, error.details || '')

  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.info('[Bootstrap] Sending error to renderer...')
    mainWindow.webContents.send('bootstrap-error', error)
  } else {
    logger.warn('[Bootstrap] Main window not available, storing error for later...')
    state.lastBootstrapError = error
  }
}

function sendInitProgress(message: string, progress: number): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('init-progress', { message, progress })
  }
}

function waitForPort(port: number, host: string, timeout = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`))
        return
      }

      // Stop waiting if the process died
      if (!isPythonRunning()) {
        reject(new Error('Python process exited while waiting for port'))
        return
      }

      const sock = createConnection(port, host)
      sock.setTimeout(500) // Don't hang on connection attempt

      const cleanup = () => {
        sock.removeAllListeners()
        sock.destroy()
      }

      sock.on('connect', () => {
        cleanup()
        resolve()
      })
      sock.on('error', () => {
        cleanup()
        setTimeout(check, 1000)
      })
      sock.on('timeout', () => {
        cleanup()
        setTimeout(check, 1000)
      })
    }
    check()
  })
}

function getSyncLock(corePath: string): SyncResult | null {
  try {
    if (!existsSync(SYNC_LOCK_FILE)) return null
    const data = JSON.parse(readFileSync(SYNC_LOCK_FILE, 'utf-8'))

    // Check if pyproject.toml was modified since last successful check
    const pyprojectPath = join(corePath, 'pyproject.toml')
    if (existsSync(pyprojectPath)) {
      const stats = statSync(pyprojectPath)
      if (stats.mtimeMs <= data.lastChecked) {
        return { success: true, needsSync: false, lastChecked: data.lastChecked }
      }
    }

    // Backup: 7 day limit if we can't check file stats properly
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - data.lastChecked < oneWeek) {
      return { success: true, needsSync: false, lastChecked: data.lastChecked }
    }
    return null
  } catch {
    return null
  }
}

function setSyncLock(success: boolean): void {
  try {
    writeFileSync(SYNC_LOCK_FILE, JSON.stringify({ lastChecked: Date.now(), success }))
  } catch {}
}

function killAllLlamaServers(): void {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' })
    } else {
      // macOS/Linux: -f matches full process name, default signal is SIGTERM (safer)
      execSync('pkill -f llama-server', { stdio: 'ignore' })
    }
  } catch {
    // Silently ignore errors if process doesn't exist
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPythonExit(timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (
      !state.pythonProcess ||
      state.pythonProcess.killed ||
      state.pythonProcess.exitCode !== null
    ) {
      return true
    }
    await delay(100)
  }
  return false
}

function checkWritePermission(dir: string): boolean {
  try {
    const testFile = join(dir, '.write_test')
    writeFileSync(testFile, 'test')
    unlinkSync(testFile)
    return true
  } catch {
    return false
  }
}

async function bootstrapPython(): Promise<BootstrapResult | BootstrapError> {
  const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

  const corePath = isDev
    ? resolve(app.getAppPath(), '..', 'core')
    : join(process.resourcesPath, 'core')

  const venvPath = join(userDataPath, 'python_env')
  const pythonExe =
    process.platform === 'win32'
      ? join(venvPath, 'Scripts', 'python.exe')
      : join(venvPath, 'bin', 'python')

  const uvExe = isDev
    ? 'uv'
    : join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')

  logger.info(`[Bootstrap] Verificando ambiente em: ${venvPath}`)
  logger.info(`[Bootstrap] Core path: ${corePath}`)
  logger.info(`[Bootstrap] UV path: ${uvExe}`)

  if (!existsSync(corePath)) {
    const error: BootstrapError = {
      type: 'startup_failed',
      message: 'Core directory not found',
      details: `Expected path: ${corePath}`
    }
    return error
  }

  const isUvCommand = !uvExe.includes('/') && !uvExe.includes('\\')

  if (!isUvCommand && !existsSync(uvExe)) {
    const error: BootstrapError = {
      type: 'uv_not_found',
      message: 'uv executable not found',
      details: `Expected at: ${uvExe}. This is a installation error.`
    }
    return error
  }

  // On Linux/macOS, ensure the uv and python binaries are executable
  if (process.platform !== 'win32' && !isUvCommand && existsSync(uvExe)) {
    try {
      execSync(`chmod +x "${uvExe}"`, { stdio: 'ignore' })
      logger.info(`[Bootstrap] chmod +x applied to ${uvExe}`)

      const bundledPython = join(process.resourcesPath, 'bin', 'python', 'bin', 'python3')
      if (existsSync(bundledPython)) {
        execSync(`chmod +x "${bundledPython}"`, { stdio: 'ignore' })
        logger.info(`[Bootstrap] chmod +x applied to bundled python`)
      }
    } catch (e) {
      logger.warn(`[Bootstrap] Could not chmod +x binaries: ${e}`)
    }
  }

  if (!checkWritePermission(userDataPath)) {
    const error: BootstrapError = {
      type: 'permission_denied',
      message: 'Cannot write to user data directory',
      details: `Path: ${userDataPath}. Check antivirus or run as administrator.`
    }
    return error
  }

  if (!existsSync(pythonExe)) {
    logger.info('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    sendInitProgress('Criando ambiente isolado...', 5)

    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

    try {
      logger.info(`[Bootstrap] Running: "${uvExe}" venv "${venvPath}" --python 3.12 --seed`)
      logger.info('[Bootstrap] uv will download Python automatically if not found')
      await new Promise<void>((resolve, reject) => {
        const child = spawn(uvExe, ['venv', venvPath, '--python', '3.12', '--seed'], {
          shell: false,
          stdio: 'pipe',
          windowsVerbatimArguments: false
        })
        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (data) => {
          stdout += data.toString()
          logger.info(`[uv venv] ${data.toString().trim()}`)
        })
        child.stderr?.on('data', (data) => {
          stderr += data.toString()
          logger.info(`[uv venv stderr] ${data.toString().trim()}`)
        })
        child.on('close', (code) => {
          if (code === 0) {
            logger.info('[Bootstrap] Venv criado com sucesso.')
            resolve()
          } else {
            logger.error(`[Bootstrap] uv venv failed with code ${code}`)
            logger.error(`[Bootstrap] stderr: ${stderr}`)
            logger.error(`[Bootstrap] stdout: ${stdout}`)
            reject(new Error(stderr || `uv venv failed with code ${code}`))
          }
        })
        child.on('error', (err) => {
          logger.error('[Bootstrap] uv venv spawn error:', err)
          reject(err)
        })
      })
    } catch (err: any) {
      const error: BootstrapError = {
        type: 'venv_failed',
        message: 'Failed to create Python virtual environment',
        details: err.message || String(err)
      }
      return error
    }
  }

  const syncLock = getSyncLock(corePath)
  if (!syncLock || syncLock.needsSync) {
    logger.info('[Bootstrap] Sincronizando dependências do core...')
    sendInitProgress('Instalando dependências...', 15)

    try {
      logger.info(`[Bootstrap] Running: "${uvExe}" pip install -e "${corePath}"`)
      await new Promise<void>((resolve, reject) => {
        const child = spawn(uvExe, ['pip', 'install', '--no-progress', '-e', corePath], {
          env: { ...process.env, VIRTUAL_ENV: venvPath },
          shell: false,
          stdio: 'pipe',
          windowsVerbatimArguments: false
        })
        let stderr = ''
        let stdout = ''
        child.stderr?.on('data', (data) => {
          stderr += data.toString()
          logger.info(`[uv pip stderr] ${data.toString().trim()}`)
        })
        child.stdout?.on('data', (data) => {
          stdout += data.toString()
          logger.info(`[uv pip] ${data.toString().trim()}`)
        })
        child.on('close', (code) => {
          if (code === 0) {
            logger.info('[Bootstrap] Dependências instaladas com sucesso.')
            resolve()
          } else {
            logger.error(`[Bootstrap] uv pip failed with code ${code}`)
            logger.error(`[Bootstrap] stderr: ${stderr}`)
            logger.error(`[Bootstrap] stdout: ${stdout}`)
            reject(new Error(stderr || `sync failed with code ${code}`))
          }
        })
        child.on('error', reject)
      })
      logger.info('[Bootstrap] Dependências sincronizadas com sucesso.')
      setSyncLock(true)
    } catch (err: any) {
      logger.error('[Bootstrap] Erro ao sincronizar dependências:', err.message || err)
      setSyncLock(false)
      const error: BootstrapError = {
        type: 'sync_failed',
        message: 'Failed to install Python dependencies',
        details: err.message || String(err)
      }
      return error
    }
  } else {
    logger.info('[Bootstrap] Sincronização ignorada (verificado recentemente).')
  }

  return { pythonExe, corePath, uvExe, venvPath }
}

function buildEnv(venvPath: string, dataDir: string, uvExe: string) {
  const isWin = process.platform === 'win32'
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
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

  if (isWin) {
    // Windows-specific environment variables
    base.SystemRoot = process.env.SystemRoot
    base.SystemDrive = process.env.SystemDrive
    base.USERPROFILE = process.env.USERPROFILE
    base.APPDATA = process.env.APPDATA
    base.LOCALAPPDATA = process.env.LOCALAPPDATA
  } else {
    // Linux/macOS-specific environment variables
    base.HOME = process.env.HOME
    base.USER = process.env.USER
    base.SHELL = process.env.SHELL
    base.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME
    base.XDG_DATA_HOME = process.env.XDG_DATA_HOME
    base.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME
    base.DBUS_SESSION_BUS_ADDRESS = process.env.DBUS_SESSION_BUS_ADDRESS
    base.DISPLAY = process.env.DISPLAY
  }

  return base
}

let restartAttempts = 0

export async function startPythonBackend(): Promise<void> {
  try {
    const result = await bootstrapPython()

    if ('type' in result) {
      sendErrorToRenderer(result)
      return
    }

    const { pythonExe, corePath, venvPath } = result
    const dataDir = join(userDataPath, 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    logger.info(`[Electron] Iniciando backend Python em: ${corePath}`)
    logger.info(`[Electron] Python executable: ${pythonExe}`)

    const { uvExe } = result
    const env = buildEnv(venvPath, dataDir, uvExe)
    let stderrBuffer = ''

    setPythonStartTime(Date.now())
    const pythonProcess = spawn(pythonExe, ['main.py'], {
      cwd: corePath,
      shell: false,
      stdio: 'pipe',
      env
    })

    setPythonProcess(pythonProcess)
    pythonProcess.stdout?.setEncoding('utf8')
    pythonProcess.stdout?.on('data', (data) => {
      const line = data.trim()
      logger.info(`[Python] ${line}`)

      // Parse init progress from Python stdout: [Init 10%] api: message
      const initMatch = line.match(INIT_PROGRESS_REGEX)
      if (initMatch) {
        const progress = parseInt(initMatch[1], 10)
        const message = initMatch[2]
        sendInitProgress(message, progress)
      }
    })

    // Wait for the server to be up before notifying renderer to start HTTP requests
    const host = process.env.HOST || '127.0.0.1'
    const port = parseInt(process.env.PORT || '8000')

    waitForPort(port, host, 60000)
      .then(() => {
        logger.info(`[Electron] Backend HTTP server is online on ${host}:${port}`)

        // Backend considered "stable" enough to reset retry counter after it's online
        restartAttempts = 0

        const window = getMainWindow()
        if (window && !window.isDestroyed()) {
          window.webContents.send('backend-online')
        }
      })
      .catch((err) => {
        logger.error(`[Electron] Failed to detect backend port: ${err.message}`)
      })

    pythonProcess.stderr?.setEncoding('utf8')
    pythonProcess.stderr?.on('data', (data: string) => {
      // Limita o buffer para evitar estouro de memória (mantém os últimos 100kb de erros)
      stderrBuffer = (stderrBuffer + data).slice(-100000)
      const lines = data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      for (const line of lines) {
        const lower = line.toLowerCase()
        // Improved log classification
        const isInfo =
          lower.startsWith('info:') ||
          lower.startsWith('successfully') ||
          lower.includes('using loop:') ||
          lower.includes('awaiting initialization') ||
          lower.includes("couldn't access the hub")

        const isWarning = lower.includes('warning')

        if (isInfo) {
          logger.info(`[Python] ${line}`)
        } else if (isWarning) {
          logger.warn(`[Python] ${line}`)
        } else {
          logger.error(`[Python] ${line}`)
        }
      }
    })

    pythonProcess.on('close', (code) => {
      const runDuration = Date.now() - (state.pythonStartTime || 0)
      logger.info(`[Python] Processo encerrado com código ${code} (Duração: ${runDuration}ms)`)
      setPythonProcess(null)

      if (!state.isQuitting && code !== 0) {
        // Auto-retry once if it crashed during the initial setup/boot phase
        // If it got past the port check (online), restartAttempts would be 0
        if (restartAttempts < 1) {
          restartAttempts++
          logger.warn(
            `[Python] Crash detectado durante boot (Código: ${code}). Tentando reiniciar (Tentativa ${restartAttempts})...`
          )
          setTimeout(() => startPythonBackend(), 2000)
          return
        }

        logger.warn('[Python] Processo morreu de forma inesperada. Limpando llama-server...')
        killAllLlamaServers()

        let errorType: BootstrapErrorType = 'startup_failed'
        let errorMessage = `Python backend crashed with code ${code}`
        let errorDetails = 'Check logs for more details'

        if (
          stderrBuffer.includes('Microsoft Visual C++ Redistributable') ||
          stderrBuffer.includes('c10.dll')
        ) {
          errorType = 'missing_vc_redist'
          errorMessage = 'Microsoft Visual C++ Redistributable is missing'
          errorDetails =
            'This application requires the Visual C++ Redistributable to run AI models. Please install it from: https://aka.ms/vs/17/release/vc_redist.x64.exe'
        }

        const error: BootstrapError = {
          type: errorType,
          message: errorMessage,
          details: errorDetails
        }

        // Reset counter before sending error so manual retries from UI can work
        restartAttempts = 0
        sendErrorToRenderer(error)
      }
    })

    pythonProcess.on('error', (err) => {
      logger.error('[Python] Erro no processo:', err)
      setPythonProcess(null)
      const error: BootstrapError = {
        type: 'startup_failed',
        message: 'Failed to start Python backend',
        details: err.message
      }
      sendErrorToRenderer(error)
    })
  } catch (err: any) {
    logger.error('[Electron] Falha ao iniciar backend:', err)
    const error: BootstrapError = {
      type: 'unknown',
      message: 'Unexpected error during startup',
      details: err.message || String(err)
    }
    sendErrorToRenderer(error)
  }
}

async function killPythonBackend(): Promise<void> {
  if (!state.pythonProcess || !state.pythonProcess.pid) {
    logger.info('[Electron] Python process não está rodando.')
    return
  }

  const pid = state.pythonProcess.pid
  logger.info(`[Electron] Encerrando Python (PID ${pid})...`)

  try {
    state.pythonProcess.kill('SIGTERM')
    if (await waitForPythonExit(2000)) {
      logger.info('[Electron] Python encerrado graciosamente.')
      return
    }

    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const child = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true })
        child.on('close', () => resolve())
        child.on('error', () => resolve())
      })
    } else {
      state.pythonProcess.kill('SIGKILL')
    }

    if (await waitForPythonExit(1000)) {
      logger.info('[Electron] Python encerrado.')
      return
    }
  } catch (err) {
    logger.error('[Electron] Erro durante shutdown de Python:', err)
  } finally {
    setPythonProcess(null)
  }
}

export async function shutdownPython(): Promise<void> {
  setIsQuitting(true)
  await killPythonBackend()
  await delay(1000)
  killAllLlamaServers()
}

export function isPythonRunning(): boolean {
  return (
    state.pythonProcess !== null &&
    !state.pythonProcess.killed &&
    state.pythonProcess.exitCode === null
  )
}
