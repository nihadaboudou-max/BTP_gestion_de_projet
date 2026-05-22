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

  // ─── Multi-tenant : table companies ──────────────────────────────────────
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_plan') THEN
       CREATE TYPE company_plan AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_status') THEN
       CREATE TYPE company_status AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
     END IF;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS companies (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     slug TEXT NOT NULL UNIQUE,
     owner_email TEXT,
     phone TEXT,
     address TEXT,
     country TEXT DEFAULT 'SN',
     currency TEXT NOT NULL DEFAULT 'FCFA',
     logo_url TEXT,
     plan company_plan NOT NULL DEFAULT 'FREE',
     status company_status NOT NULL DEFAULT 'TRIAL',
     trial_ends_at TIMESTAMP,
     max_users INTEGER DEFAULT 5,
     max_projects INTEGER DEFAULT 3,
     notes TEXT,
     is_active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMP NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMP NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS impersonation_logs (
     id SERIAL PRIMARY KEY,
     super_admin_id INTEGER NOT NULL,
     target_user_id INTEGER NOT NULL,
     target_company_id INTEGER NOT NULL,
     reason TEXT,
     started_at TIMESTAMP NOT NULL DEFAULT NOW(),
     ended_at TIMESTAMP
   )`,

  // ─── Rôle SUPER_ADMIN et COMPTABLE (étendre l'enum) ────────────────────
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUPER_ADMIN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
       ALTER TYPE user_role ADD VALUE 'SUPER_ADMIN';
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPTABLE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
       ALTER TYPE user_role ADD VALUE 'COMPTABLE';
     END IF;
   END $$;`,

  // ─── Pay modes PRESTATAIRE et PAR_M2 ───────────────────────────────────
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRESTATAIRE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pay_mode')) THEN
       ALTER TYPE pay_mode ADD VALUE 'PRESTATAIRE';
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PAR_M2' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pay_mode')) THEN
       ALTER TYPE pay_mode ADD VALUE 'PAR_M2';
     END IF;
   END $$;`,

  // ─── Colonne companyId partout ─────────────────────────────────────────
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS is_prestataire BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE personnel ADD COLUMN IF NOT EXISTS rate_per_sqm NUMERIC(15, 2)`,
  `ALTER TABLE pointage_sheets ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE pointage_entries ADD COLUMN IF NOT EXISTS surface_produced NUMERIC(10, 2)`,
  `ALTER TABLE pointage_entries ADD COLUMN IF NOT EXISTS rate_per_sqm NUMERIC(15, 2)`,
  `ALTER TABLE pointage_entries ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(15, 2)`,
  `ALTER TABLE pointage_entries ADD COLUMN IF NOT EXISTS weekly_progress_pct INTEGER`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_personnel_id INTEGER REFERENCES personnel(id)`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_amount NUMERIC(15, 2)`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS company_id INTEGER`,

  // ─── Backfill : créer une company par défaut + rattacher données existantes ──
  `INSERT INTO companies (name, slug, status, plan, is_active)
   SELECT 'HAIROU Default', 'hairou-default', 'ACTIVE', 'PRO', TRUE
   WHERE NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'hairou-default')`,
  `UPDATE users SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default')
   WHERE company_id IS NULL AND role != 'SUPER_ADMIN'`,
  `UPDATE projects SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `UPDATE personnel SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `UPDATE pointage_sheets SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `UPDATE expenses SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `UPDATE tasks SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `UPDATE payments SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,

  // ─── Index pour perf multi-tenant ──────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_personnel_company ON personnel(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pointage_company ON pointage_sheets(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id)`,

  // ─── Reclamations : ajouter ERREUR_HEURES + companyId + entryId ───────
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ERREUR_HEURES' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reclamation_type')) THEN
       ALTER TYPE reclamation_type ADD VALUE 'ERREUR_HEURES';
     END IF;
   END $$;`,
  `ALTER TABLE reclamations ADD COLUMN IF NOT EXISTS company_id INTEGER`,
  `ALTER TABLE reclamations ADD COLUMN IF NOT EXISTS entry_id INTEGER`,
  `UPDATE reclamations SET company_id = (SELECT id FROM companies WHERE slug = 'hairou-default') WHERE company_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_reclamations_company ON reclamations(company_id)`,
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
