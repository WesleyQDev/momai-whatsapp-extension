import { app } from 'electron'
import { spawn, execSync } from 'child_process'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { state, setPythonProcess, setPythonStartTime, setIsQuitting } from './state'
import { is } from '@electron-toolkit/utils'

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
  return !state.pythonProcess || state.pythonProcess.killed || state.pythonProcess.exitCode !== null
}

async function bootstrapPython(): Promise<BootstrapResult> {
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

  console.log(`[Bootstrap] Verificando ambiente em: ${venvPath}`)

  if (!existsSync(pythonExe)) {
    console.log('[Bootstrap] Ambiente não encontrado. Iniciando setup com uv...')
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

    await new Promise<void>((resolve, reject) => {
      const child = spawn(uvExe, ['venv', venvPath, '--python', '3.12', '--seed'], {
        shell: true,
        stdio: 'inherit'
      })
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`uv venv failed with ${code}`))
      )
      child.on('error', reject)
    })
    console.log('[Bootstrap] Venv criado.')
  }

  const syncLock = getSyncLock()
  if (!syncLock || syncLock.needsSync) {
    console.log('[Bootstrap] Sincronizando dependências do core...')
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
        })
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(stderr || `sync failed with ${code}`))
        )
        child.on('error', reject)
      })
      console.log('[Bootstrap] Dependências sincronizadas com sucesso.')
      setSyncLock(true)
    } catch (err: any) {
      console.error('[Bootstrap] Erro ao sincronizar dependências:', err.message || err)
      setSyncLock(false)
    }
  } else {
    console.log('[Bootstrap] Sincronização ignorada (verificado recentemente).')
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
    const { pythonExe, corePath, venvPath } = await bootstrapPython()
    const dataDir = join(userDataPath, 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    console.log(`[Electron] Iniciando backend Python em: ${corePath}`)

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
      process.stdout.write(`[Python]: ${data}`)
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
          process.stdout.write(`[Python]: ${line}\n`)
        } else {
          process.stderr.write(`[Python Error]: ${line}\n`)
        }
      }
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Python] Processo encerrado com código ${code}`)
      setPythonProcess(null)
      if (!state.isQuitting && code !== 0) {
        console.warn('[Python] Processo morreu de forma inesperada. Limpando llama-serve...')
        killAllLlamaServers()
      }
    })

    pythonProcess.on('error', (err) => {
      console.error('[Python] Erro no processo:', err)
      setPythonProcess(null)
    })
  } catch (err) {
    console.error('[Electron] Falha ao iniciar backend:', err)
  }
}

async function killPythonBackend(): Promise<void> {
  if (!state.pythonProcess || !state.pythonProcess.pid) {
    console.log('[Electron] Python process não está rodando.')
    return
  }

  const pid = state.pythonProcess.pid
  console.log(`[Electron] Encerrando Python (PID ${pid})...`)

  try {
    state.pythonProcess.kill('SIGTERM')
    if (await waitForPythonExit(2000)) {
      console.log('[Electron] Python encerrado graciosamente.')
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
      console.log('[Electron] Python encerrado.')
      return
    }
  } catch (err) {
    console.error('[Electron] Erro durante shutdown de Python:', err)
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
