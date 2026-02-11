import { app } from 'electron';

export function getUserDataPath() {
  return app.getPath('userData');
}
