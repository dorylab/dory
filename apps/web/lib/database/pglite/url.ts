import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function ensureFileUrl(value: string): string {
  if (!value) throw new Error("empty path/url");

  if (value.startsWith("file:")) {
    const fsPath = fileURLToPath(value);
    return pathToFileURL(fsPath).toString();
  }

  const fsPath = decodeURIComponent(value);
  return pathToFileURL(path.resolve(fsPath)).toString();
}

export function extractFilePath(value: string): string {
  if (!value) throw new Error("empty path/url");

  if (value.startsWith("file:")) {
    return fileURLToPath(value);
  }

  return decodeURIComponent(value);
}
