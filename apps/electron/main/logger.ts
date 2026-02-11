import { app } from 'electron';
import electronLog from 'electron-log';

export type LogFn = (...args: unknown[]) => void;

export interface MainLogger {
  log: LogFn;
  logWarn: LogFn;
  logError: LogFn;
}

interface SetupMainLoggerOptions {
  isDev: boolean;
  databasePath: string;
  protocol: string;
}

export function setupMainLogger({
  isDev,
  databasePath,
  protocol,
}: SetupMainLoggerOptions): MainLogger {
  electronLog.initialize();
  electronLog.transports.console.level = isDev ? 'debug' : 'info';
  electronLog.transports.file.level = 'info';

  const logger = electronLog.scope('main');
  const log: LogFn = (...args) => logger.info(...args);
  const logWarn: LogFn = (...args) => logger.warn(...args);
  const logError: LogFn = (...args) => logger.error(...args);

  log('[electron] logFile:', electronLog.transports.file.getFile().path);
  log('[electron] execPath:', process.execPath);
  log('[electron] argv:', process.argv);
  log('[electron] isPackaged:', app.isPackaged);
  log('[electron] defaultApp:', process.defaultApp);
  log('[electron] appName:', app.getName());
  log('[electron] appPath:', app.getAppPath());
  log('[electron] exePath:', app.getPath('exe'));
  log('[electron] userData:', app.getPath('userData'));
  log('[electron] resourcesPath:', process.resourcesPath);
  log('[electron] databasePath:', databasePath);

  const startupDeepLink = process.argv.find(arg => arg.startsWith(`${protocol}://`));
  if (startupDeepLink) {
    log('[electron] startup deep link argv:', startupDeepLink);
  }

  process.on('uncaughtException', error => {
    logError('[electron] uncaughtException:', error);
  });

  process.on('unhandledRejection', reason => {
    logError('[electron] unhandledRejection:', reason);
  });

  return { log, logWarn, logError };
}
