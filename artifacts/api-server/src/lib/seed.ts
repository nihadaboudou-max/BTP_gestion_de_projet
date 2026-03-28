import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { hashPassword } from "./auth.js";
import { logger } from "./logger.js";

export async function seedIfEmpty() {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) {
      logger.info("Seed skipped — users already exist");
      return;
    }

    logger.info("No users found — seeding default accounts...");

    const adminHash = await hashPassword("Admin2024!");
    const chefHash = await hashPassword("Chef2024!");

    await db.insert(usersTable).values([
      {
        email: "admin@hairou.com",
        name: "Administrateur HAIROU",
        passwordHash: adminHash,
        role: "ADMIN",
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
        isActive: true,
        canAddWorkers: true,
        canDeleteWorkers: false,
        canEditWorkers: true,
        canAddExpenses: true,
        canDeleteExpenses: false,
        canAddProjects: false,
        canViewFinances: true,
        canManagePointage: true,
      },
      {
        email: "ouvrier@hairou.com",
        name: "Mamadou Traoré",
        passwordHash: chefHash,
        role: "OUVRIER",
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
  } catch (err) {
    logger.error({ err }, "Seed failed — continuing without seed data");
  }
}
