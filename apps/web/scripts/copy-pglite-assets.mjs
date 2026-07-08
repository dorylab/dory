import { mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const projectRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(projectRoot, "dist-scripts");

const pgliteDist = path.resolve(
  projectRoot,
  "../../node_modules/@electric-sql/pglite/dist"
);

await mkdir(outDir, { recursive: true });

for (const f of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  await copyFile(path.join(pgliteDist, f), path.join(outDir, f));
  console.log(`[copy] ${f} -> dist-scripts/${f}`);
}

for (const f of ["postgres.data", "postgres.wasm"]) {
  await rm(path.join(outDir, f), { force: true });
  console.log(`[remove legacy] dist-scripts/${f}`);
}
