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
  // payments : type ENUM + table (création si absent)
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
       CREATE TYPE payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'OTHER');
     END IF;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS payments (
     id SERIAL PRIMARY KEY,
     personnel_id INTEGER NOT NULL REFERENCES personnel(id),
     period_start DATE NOT NULL,
     period_end DATE NOT NULL,
     amount NUMERIC(15, 2) NOT NULL,
     payment_date DATE NOT NULL,
     payment_method payment_method NOT NULL DEFAULT 'CASH',
     reference TEXT,
     notes TEXT,
     paid_by INTEGER NOT NULL REFERENCES users(id),
     created_at TIMESTAMP NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_personnel ON payments(personnel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period_start, period_end)`,
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
