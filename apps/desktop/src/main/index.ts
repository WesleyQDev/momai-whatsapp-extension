import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, type ChildProcess } from 'child_process'
import icon from '../../resources/icon.png?asset'

let pythonProcess: ChildProcess | null = null

function startPythonBackend(): void {
  const cwd = process.cwd()
  // Se rodando de apps/desktop, o core está em ../core
  const corePath = resolve(cwd, '../core')
  
  console.log(`[Electron] Iniciando backend Python em: ${corePath}`)

  // Usamos shell: true no Windows para garantir que o comando 'uv' seja encontrado
  pythonProcess = spawn('uv', ['run', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: corePath,
    shell: true,
    stdio: 'pipe'
  })

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
    if (process.platform === 'win32') {
      // No Windows, matar apenas o processo pai (cmd) não mata o filho (uvicorn).
      // Usamos taskkill /T (tree) para garantir.
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'])
    } else {
      pythonProcess.kill()
    }
    pythonProcess = null
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
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

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', killPythonBackend) // Garante que o Python morra ao fechar

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
