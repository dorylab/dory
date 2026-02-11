import { app } from 'electron';
import path from 'node:path';
import type { LogFn } from './logger.js';

export function registerProtocolClient(protocol: string, log: LogFn) {
  app.removeAsDefaultProtocolClient(protocol);
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }
  log('[electron] isDefaultProtocolClient:', app.isDefaultProtocolClient(protocol));
}
