import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const logsDir = join(app.getPath('userData'), 'logs')
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true })
}

log.transports.file.resolvePathFn = () => join(logsDir, 'main.log')
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

log.variables.version = app.getVersion()

export const logger = log

export function getLogsPath(): string {
  return logsDir
}

export function getMainLogPath(): string {
  return join(logsDir, 'main.log')
}
