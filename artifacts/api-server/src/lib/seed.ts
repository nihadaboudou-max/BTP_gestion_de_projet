import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, isNull, sql } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { logger } from "./logger.js";

export async function seedIfEmpty() {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);

    if (existing.length === 0) {
      logger.info("No users found — seeding default accounts...");

      const adminHash = await hashPassword("Admin2024!");
      const chefHash = await hashPassword("Chef2024!");

      await db.insert(usersTable).values([
        {
          email: "admin@hairou.com",
          name: "Administrateur HAIROU",
          passwordHash: adminHash,
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
        },
        {
          email: "chef@hairou.com",
          name: "Jean-Baptiste Konan",
          passwordHash: chefHash,
          role: "CHEF_CHANTIER",
          status: "APPROVED",
          isActive: true,
          canAddWorkers: true,
          canDeleteWorkers: false,
          canEditWorkers: true,
          canAddExpenses: true,
          canDeleteExpenses: false,
          canAddProjects: true,
          canViewFinances: true,
          canManagePointage: true,
        },
        {
          email: "ouvrier@hairou.com",
          name: "Mamadou Traoré",
          passwordHash: chefHash,
          role: "OUVRIER",
          status: "APPROVED",
          isActive: true,
          canAddWorkers: false,
          canDeleteWorkers: false,
          canEditWorkers: false,
          canAddExpenses: true,
          canDeleteExpenses: false,
          canAddProjects: false,
          canViewFinances: false,
          canManagePointage: false,
        },
      ]);

      logger.info("Seed complete — 3 default accounts created");
    } else {
      logger.info("Users exist — running permission migrations...");
    }

    // Auto-migration: ensure all CHEF_CHANTIER have can_add_projects = true
    await db
      .update(usersTable)
      .set({ canAddProjects: true })
      .where(eq(usersTable.role, "CHEF_CHANTIER"));

    // Auto-migration: set status=APPROVED for any users without a status set
    await db
      .update(usersTable)
      .set({ status: "APPROVED" })
      .where(isNull(usersTable.status));

    logger.info("Permission migration complete");
  } catch (err) {
    logger.error({ err }, "Seed/migration failed — continuing without seed data");
  }
}
