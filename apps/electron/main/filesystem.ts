import fs from 'node:fs';

export function ensureDirectoryExists(directoryPath: string) {
  if (fs.existsSync(directoryPath)) return;
  fs.mkdirSync(directoryPath, { recursive: true });
}
