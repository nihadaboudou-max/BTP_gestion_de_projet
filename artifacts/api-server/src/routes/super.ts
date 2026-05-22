/**
 * Routes /api/super/* — Super-admin (vous, propriétaire de la plateforme).
 *
 * NON listées dans le swagger / openapi pour rester invisibles.
 * Toutes protégées par requireSuperAdmin → 404 si pas SUPER_ADMIN
 * (on ne dévoile pas l'existence de ces endpoints).
 *
 * Endpoints :
 *  - GET    /companies                 → liste toutes les entreprises + stats
 *  - GET    /companies/:id             → détail d'une entreprise (KPIs)
 *  - POST   /companies                 → créer une entreprise + son admin
 *  - PUT    /companies/:id             → modifier (plan, statut, limites…)
 *  - DELETE /companies/:id             → désactiver
 *  - POST   /impersonate/:userId       → générer un JWT temporaire pour ce user
 *  - GET    /impersonations            → log des sessions d'impersonation
 *  - GET    /stats                     → KPIs globaux plateforme
 */
import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  companiesTable, usersTable, impersonationLogsTable,
  projectsTable, personnelTable, pointageSheetsTable, expensesTable, paymentsTable,
} from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import {
  authenticate, requireSuperAdmin, generateTokens, hashPassword, type AuthRequest,
} from "../lib/auth.js";

const router = Router();

/** Toutes les routes /super/* nécessitent SUPER_ADMIN — sinon 404 */
router.use(authenticate, requireSuperAdmin);

// ─── GET /companies ───────────────────────────────────────────────────────
router.get("/companies", async (req: AuthRequest, res) => {
  try {
    const rows = await pool.query<any>(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM users WHERE company_id = c.id) AS user_count,
        (SELECT COUNT(*) FROM projects WHERE company_id = c.id) AS project_count,
        (SELECT COUNT(*) FROM personnel WHERE company_id = c.id) AS personnel_count,
        (SELECT COUNT(*) FROM pointage_sheets WHERE company_id = c.id) AS pointage_count,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM expenses WHERE company_id = c.id) AS total_expenses,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments WHERE company_id = c.id) AS total_payments
      FROM companies c
      ORDER BY c.created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    req.log.error({ err }, "Super list companies error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /companies/:id ───────────────────────────────────────────────────
router.get("/companies/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.companyId, id));

    const stats = await pool.query<any>(`
      SELECT
        (SELECT COUNT(*) FROM projects WHERE company_id = $1) AS project_count,
        (SELECT COUNT(*) FROM personnel WHERE company_id = $1) AS personnel_count,
        (SELECT COUNT(*) FROM pointage_sheets WHERE company_id = $1) AS pointage_count,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM expenses WHERE company_id = $1) AS total_expenses,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments WHERE company_id = $1) AS total_payments
    `, [id]);

    res.json({ company, users, stats: stats.rows[0] });
  } catch (err) {
    req.log.error({ err }, "Super get company error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /companies ──────────────────────────────────────────────────────
router.post("/companies", async (req: AuthRequest, res) => {
  try {
    const { name, slug, ownerEmail, ownerName, ownerPassword, plan, phone, address, country } = req.body ?? {};
    if (!name || !slug || !ownerEmail || !ownerPassword || !ownerName) {
      res.status(400).json({ error: "Validation", message: "name, slug, ownerName, ownerEmail, ownerPassword requis" });
      return;
    }

    // Vérifie le slug
    const [existingSlug] = await db.select().from(companiesTable).where(eq(companiesTable.slug, slug)).limit(1);
    if (existingSlug) {
      res.status(409).json({ error: "Conflit", message: "Ce slug est déjà utilisé" });
      return;
    }
    const [existingEmail] = await db.select().from(usersTable).where(eq(usersTable.email, ownerEmail)).limit(1);
    if (existingEmail) {
      res.status(409).json({ error: "Conflit", message: "Cet email est déjà utilisé" });
      return;
    }

    const [company] = await db.insert(companiesTable).values({
      name, slug, ownerEmail,
      phone: phone || null,
      address: address || null,
      country: country || "SN",
      plan: plan || "FREE",
      status: "TRIAL",
    }).returning();

    const passwordHash = await hashPassword(ownerPassword);
    const [admin] = await db.insert(usersTable).values({
      companyId: company.id,
      email: ownerEmail,
      name: ownerName,
      passwordHash,
      role: "ADMIN",
      status: "APPROVED",
      isActive: true,
      canAddWorkers: true,
      canDeleteWorkers: true,
      canEditWorkers: true,
      canAddExpenses: true,
      canDeleteExpenses: true,
      canAddProjects: true,
      canViewFinances: true,
      canManagePointage: true,
    }).returning();

    res.status(201).json({ company, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (err) {
    req.log.error({ err }, "Super create company error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /companies/:id ───────────────────────────────────────────────────
router.put("/companies/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body ?? {};
    const updates: any = {};
    for (const k of ["name", "ownerEmail", "phone", "address", "country", "currency", "plan", "status", "maxUsers", "maxProjects", "notes", "isActive"]) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    updates.updatedAt = new Date();
    const [company] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, id)).returning();
    if (!company) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Super update company error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /companies/:id ────────────────────────────────────────────────
router.delete("/companies/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    // Soft-delete : on désactive seulement
    const [company] = await db.update(companiesTable)
      .set({ isActive: false, status: "CANCELLED", updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();
    if (!company) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Super delete company error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /impersonate/:userId ───────────────────────────────────────────
// Génère un JWT temporaire pour se connecter en tant que ce user.
// Log dans impersonation_logs (table cachée).
router.post("/impersonate/:userId", async (req: AuthRequest, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const { reason } = req.body ?? {};

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
    if (!target) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    if (target.role === "SUPER_ADMIN") {
      res.status(403).json({ error: "Interdit", message: "Impossible d'impersoner un super-admin" });
      return;
    }

    const [log] = await db.insert(impersonationLogsTable).values({
      superAdminId: req.user!.userId,
      targetUserId,
      targetCompanyId: (target as any).companyId || 0,
      reason: reason || null,
    }).returning();

    // Génère un JWT de courte durée (2h) avec marker impersonatedBy
    const { token } = generateTokens({
      userId: target.id,
      email: target.email,
      role: target.role,
      companyId: (target as any).companyId ?? null,
      impersonatedBy: req.user!.userId,
    });

    res.json({
      token,
      logId: log.id,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        companyId: (target as any).companyId,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Super impersonate error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /impersonations ──────────────────────────────────────────────────
router.get("/impersonations", async (req: AuthRequest, res) => {
  try {
    const logs = await db.select()
      .from(impersonationLogsTable)
      .orderBy(desc(impersonationLogsTable.startedAt))
      .limit(200);
    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Super impersonations error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────
router.get("/stats", async (req: AuthRequest, res) => {
  try {
    const r = await pool.query<any>(`
      SELECT
        (SELECT COUNT(*) FROM companies WHERE is_active = TRUE) AS active_companies,
        (SELECT COUNT(*) FROM companies WHERE status = 'TRIAL') AS trial_companies,
        (SELECT COUNT(*) FROM companies WHERE status = 'ACTIVE') AS paying_companies,
        (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS total_users,
        (SELECT COUNT(*) FROM projects) AS total_projects,
        (SELECT COUNT(*) FROM personnel) AS total_personnel,
        (SELECT COUNT(*) FROM pointage_sheets) AS total_pointages,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments) AS total_paid
    `);
    res.json(r.rows[0]);
  } catch (err) {
    req.log.error({ err }, "Super stats error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
