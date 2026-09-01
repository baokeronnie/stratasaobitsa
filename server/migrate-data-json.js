// server/migrate-data-json.js
//
// One-off helper: if you were previously running the file-based version of
// this server and have a real server/data.json with orders/menu/users you
// want to keep, run this once to copy it into Postgres.
//
// Usage:
//   1. Set DATABASE_URL in server/.env (see .env.example)
//   2. From the server/ folder: npm run migrate-local-data
//
// Safe to run only when the app_state table is empty — it refuses to
// overwrite existing data in the database.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data.json");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Set it in server/.env before running this script.");
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  console.error(`No local data.json found at ${DATA_FILE} — nothing to migrate.`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT id FROM app_state WHERE id = 1");
  if (rows.length > 0) {
    console.error("The database already has data in app_state — refusing to overwrite it.");
    console.error("If you really want to replace it, delete the row manually first:");
    console.error("  DELETE FROM app_state WHERE id = 1;");
    process.exit(1);
  }

  await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1)", [JSON.stringify(data)]);
  console.log(`Migrated ${data.users?.length || 0} user(s), ${data.menu?.length || 0} menu item(s), and ${data.orders?.length || 0} order(s) into Postgres.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
