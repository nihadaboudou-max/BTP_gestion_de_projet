import { db } from "@workspace/db";
import { usersTable, companiesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { logger } from "./logger.js";

export async function seedIfEmpty() {
  try {
    // 1) Création du SUPER_ADMIN (vous) si absent
    const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL || "superadmin@hairou.com";
    const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@2026!";

    const [existingSuper] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.role, "SUPER_ADMIN")).limit(1);

    if (!existingSuper) {
      const passwordHash = await hashPassword(SUPER_PASSWORD);
      await db.insert(usersTable).values({
        companyId: null,        // SUPER_ADMIN sans entreprise
        email: SUPER_EMAIL,
        name: "Super Admin",
        passwordHash,
        role: "SUPER_ADMIN",
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
      });
      logger.info({ email: SUPER_EMAIL }, "SUPER_ADMIN account created");
    }

    // 2) Création de la company par défaut + comptes démo si la DB est vide
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ADMIN")).limit(1);

    if (existing.length === 0) {
      logger.info("No ADMIN user found — seeding default company + 3 demo accounts");

      // Récupère ou crée la company par défaut
      let [defaultCompany] = await db.select().from(companiesTable).where(eq(companiesTable.slug, "hairou-default")).limit(1);
      if (!defaultCompany) {
        [defaultCompany] = await db.insert(companiesTable).values({
          name: "HAIROU Démo",
          slug: "hairou-default",
          ownerEmail: "admin@hairou.com",
          plan: "PRO",
          status: "ACTIVE",
        }).returning();
      }

      const adminHash = await hashPassword("Admin2024!");
      const chefHash = await hashPassword("Chef2024!");

      await db.insert(usersTable).values([
        {
          companyId: defaultCompany.id,
          email: "admin@hairou.com",
          name: "Administrateur HAIROU",
          passwordHash: adminHash,
          role: "ADMIN",
          status: "APPROVED",
          isActive: true,
          canAddWorkers: true, canDeleteWorkers: true, canEditWorkers: true,
          canAddExpenses: true, canDeleteExpenses: true, canAddProjects: true,
          canViewFinances: true, canManagePointage: true,
        },
        {
          companyId: defaultCompany.id,
          email: "chef@hairou.com",
          name: "Jean-Baptiste Konan",
          passwordHash: chefHash,
          role: "CHEF_CHANTIER",
          status: "APPROVED",
          isActive: true,
          canAddWorkers: true, canDeleteWorkers: false, canEditWorkers: true,
          canAddExpenses: true, canDeleteExpenses: false, canAddProjects: true,
          canViewFinances: false, canManagePointage: true,
        },
        {
          companyId: defaultCompany.id,
          email: "ouvrier@hairou.com",
          name: "Mamadou Traoré",
          passwordHash: chefHash,
          role: "OUVRIER",
          status: "APPROVED",
          isActive: true,
          canAddWorkers: false, canDeleteWorkers: false, canEditWorkers: false,
          canAddExpenses: true, canDeleteExpenses: false, canAddProjects: false,
          canViewFinances: false, canManagePointage: false,
        },
      ]);

      logger.info("Seed complete — 3 default accounts created in HAIROU Démo");
    } else {
      logger.info("Users exist — running permission migrations");
    }

    // Migrations légères
    await db.update(usersTable).set({ canAddProjects: true }).where(eq(usersTable.role, "CHEF_CHANTIER"));
    // CHEF ne doit plus voir les finances (anti-frustration)
    await db.update(usersTable).set({ canViewFinances: false }).where(eq(usersTable.role, "CHEF_CHANTIER"));
    await db.update(usersTable).set({ status: "APPROVED" }).where(isNull(usersTable.status));

    logger.info("Permission migration complete");
  } catch (err) {
    logger.error({ err }, "Seed/migration failed — continuing without seed data");
  }
}
