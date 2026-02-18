import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const logsDir = join(app.getPath('userData'), 'logs')

try {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
} catch (e) {
  console.error('Failed to create logs directory:', e)
}

log.transports.file.resolvePathFn = () => join(logsDir, 'main.log')
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

log.variables.version = app.getVersion()

log.info('[Logger] Logging initialized')
log.info(`[Logger] Log file: ${join(logsDir, 'main.log')}`)

export const logger = log

export function getLogsPath(): string {
  return logsDir
}

export function getMainLogPath(): string {
  return join(logsDir, 'main.log')
}
