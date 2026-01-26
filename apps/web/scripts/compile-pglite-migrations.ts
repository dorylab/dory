import { readMigrationFiles } from "drizzle-orm/migrator";
import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsFolder = path.resolve(__dirname, "../lib/database/pglite/migrations");

const outputPath = path.resolve(__dirname, "../lib/database/pglite/migrations.json");

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
