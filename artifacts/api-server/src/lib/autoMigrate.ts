/**
 * Auto-migration légère : ajoute les nouvelles colonnes en SQL brut si elles
 * n'existent pas déjà. Idempotent et sans risque pour les déploiements existants
 * (Render PostgreSQL), évite l'obligation de rejouer manuellement drizzle-kit.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger.js";

const ALTER_STATEMENTS = [
  // pointage_sheets : champs pro + archive
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS weather TEXT`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS site_location TEXT`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS observations TEXT`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS work_start_time TEXT`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS work_end_time TEXT`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id)`,
  // projects : archive
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
  // personnel : nouveaux champs + archive
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS address TEXT`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS birth_date TEXT`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS hire_date TEXT`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS created_via_pointage BOOLEAN NOT NULL DEFAULT FALSE`,
];

export async function autoMigrate() {
  for (const stmt of ALTER_STATEMENTS) {
    try {
      await pool.query(stmt);
    } catch (err) {
      logger.warn({ err, stmt }, "Auto-migration: statement failed (continuing)");
    }
  }
  logger.info("Auto-migration completed (added pro fields + archive columns if missing)");
}
