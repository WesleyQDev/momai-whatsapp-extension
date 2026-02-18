import { app } from 'electron'
import { spawn, execSync } from 'child_process'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { state, setPythonProcess, setPythonStartTime, setIsQuitting, getMainWindow } from './state'
import { is } from '@electron-toolkit/utils'
import { logger } from './logger'

const userDataPath = app.getPath('userData')
const SYNC_LOCK_FILE = join(userDataPath, '.sync.lock')

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

export interface BootstrapError {
  type: 'python_not_found' | 'uv_not_found' | 'venv_failed' | 'sync_failed' | 'permission_denied' | 'startup_failed' | 'unknown'
  message: string
  details?: string
}

function sendErrorToRenderer(error: BootstrapError): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bootstrap-error', error)
  }
  logger.error(`[Bootstrap] Error: ${error.type} - ${error.message}`, error.details || '')
}

function getSyncLock(): SyncResult | null {
  try {
    if (!existsSync(SYNC_LOCK_FILE)) return null
    const data = JSON.parse(readFileSync(SYNC_LOCK_FILE, 'utf-8'))
    const oneHour = 60 * 60 * 1000
    if (Date.now() - data.lastChecked < oneHour) {
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
    execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' })
  } catch {}
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
  return !state.pythonProcess || state.pythonProcess.killed || state.pythonProcess.exitCode === null
}

function checkPythonAvailable(): boolean {
  try {
    const result = execSync('python --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    logger.info(`[Bootstrap] Python found: ${result.trim()}`)
    return true
  } catch {
    try {
      const result = execSync('python3 --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
      logger.info(`[Bootstrap] Python3 found: ${result.trim()}`)
      return true
    } catch {
      return false
    }
  }
}

function checkWritePermission(dir: string): boolean {
  try {
    const testFile = join(dir, '.write_test')
    writeFileSync(testFile, 'test')
    const { unlinkSync } = require('fs')
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

  if (!checkWritePermission(userDataPath)) {
    const error: BootstrapError = {
      type: 'permission_denied',
      message: 'Cannot write to user data directory',
      details: `Path: ${userDataPath}`
    }
    return error
  }

  if (!existsSync(pythonExe)) {
    logger.info('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    
    if (!checkPythonAvailable()) {
      const error: BootstrapError = {
        type: 'python_not_found',
        message: 'Python 3.12+ is required but not found',
        details: 'Please install Python 3.12 or later from https://www.python.org/downloads/'
      }
      return error
    }

    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(uvExe, ['venv', venvPath, '--python', '3.12', '--seed'], {
          shell: true,
          stdio: 'pipe'
        })
        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (data) => {
          stdout += data.toString()
          logger.debug(`[uv venv stdout] ${data.toString()}`)
        })
        child.stderr?.on('data', (data) => {
          stderr += data.toString()
          logger.debug(`[uv venv stderr] ${data.toString()}`)
        })
        child.on('close', (code) => {
          if (code === 0) {
            logger.info('[Bootstrap] Venv criado com sucesso.')
            resolve()
          } else {
            logger.error(`[Bootstrap] uv venv failed with code ${code}: ${stderr}`)
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

  const syncLock = getSyncLock()
  if (!syncLock || syncLock.needsSync) {
    logger.info('[Bootstrap] Sincronizando dependências do core...')
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(uvExe, ['pip', 'install', '--no-progress', '-e', corePath], {
          env: { ...process.env, VIRTUAL_ENV: venvPath },
          shell: true,
          stdio: 'pipe'
        })
        let stderr = ''
        child.stderr?.on('data', (data) => {
          stderr += data.toString()
          logger.debug(`[uv pip stderr] ${data.toString()}`)
        })
        child.stdout?.on('data', (data) => {
          logger.debug(`[uv pip stdout] ${data.toString()}`)
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
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
  return {
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
}

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

    const env = buildEnv(venvPath, dataDir, '')

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
      logger.info(`[Python] ${data.trim()}`)
    })

    pythonProcess.stderr?.setEncoding('utf8')
    pythonProcess.stderr?.on('data', (data: string) => {
      const lines = data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      for (const line of lines) {
        const lower = line.toLowerCase()
        if (
          lower.startsWith('info:') ||
          lower.includes('warning') ||
          lower.includes("couldn't access the hub")
        ) {
          logger.info(`[Python] ${line}`)
        } else {
          logger.error(`[Python] ${line}`)
        }
      }
    })

    pythonProcess.on('close', (code) => {
      logger.info(`[Python] Processo encerrado com código ${code}`)
      setPythonProcess(null)
      if (!state.isQuitting && code !== 0) {
        logger.warn('[Python] Processo morreu de forma inesperada. Limpando llama-server...')
        killAllLlamaServers()
        const error: BootstrapError = {
          type: 'startup_failed',
          message: `Python backend crashed with code ${code}`,
          details: 'Check logs for more details'
        }
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
