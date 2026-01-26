// scripts/compile-pglite-migrations.ts

import { readMigrationFiles } from "drizzle-orm/migrator";
import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ---- Fix __dirname missing under ESModule ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Migrations folder (your drizzle migrations directory) ----
const migrationsFolder = path.resolve(__dirname, "../lib/client/pglite/migrations");

// ---- Output path: generate to lib/client/pglite/migrations.json or another desired location ----
const outputPath = path.resolve(__dirname, "../lib/client/pglite/migrations.json");

async function compile() {
  console.log("Reading migrations from:", migrationsFolder);

  const migrations = readMigrationFiles({ migrationsFolder });

  // Write the JSON file
  await writeFile(outputPath, JSON.stringify(migrations, null, 2), "utf8");

  console.log("Migrations compiled to:", outputPath);
}

compile().catch(err => {
  console.error("Failed to compile migrations:", err);
  process.exit(1);
});
