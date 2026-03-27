import { db } from "@workspace/db";
import { usersTable, projectsTable, personnelTable } from "@workspace/db";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const adminHash = await bcrypt.hash("Admin2024!", 12);
  const chefHash = await bcrypt.hash("Chef2024!", 12);

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "admin@hairou.com")).limit(1);

  if (existing.length === 0) {
    const [admin] = await db.insert(usersTable).values({
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
    }).returning();
    console.log("Admin created:", admin.email);

    const [chef] = await db.insert(usersTable).values({
      email: "chef@hairou.com",
      name: "Jean-Baptiste Konan",
      passwordHash: chefHash,
      role: "CHEF_CHANTIER",
      isActive: true,
      canAddWorkers: true,
      canEditWorkers: true,
      canAddExpenses: true,
      canManagePointage: true,
    }).returning();
    console.log("Chef created:", chef.email);

    const [ouvrier] = await db.insert(usersTable).values({
      email: "ouvrier@hairou.com",
      name: "Mamadou Traoré",
      passwordHash: chefHash,
      role: "OUVRIER",
      isActive: true,
    }).returning();
    console.log("Ouvrier created:", ouvrier.email);

    const [project1] = await db.insert(projectsTable).values({
      name: "Construction Villa Duplex - Cocody",
      location: "Cocody, Abidjan",
      clientName: "M. Kouadio Emmanuel",
      status: "EN_COURS",
      budgetTotal: "45000000",
      budgetSpent: "18500000",
      progress: 41,
      startDate: "2024-01-15",
      endDate: "2024-12-31",
      chefId: chef.id,
    }).returning();

    const [project2] = await db.insert(projectsTable).values({
      name: "Réhabilitation Bureau Administratif - Plateau",
      location: "Plateau, Abidjan",
      clientName: "Ministère de la Construction",
      status: "EN_COURS",
      budgetTotal: "12000000",
      budgetSpent: "5600000",
      progress: 47,
      startDate: "2024-03-01",
      endDate: "2024-09-30",
      chefId: chef.id,
    }).returning();

    const [project3] = await db.insert(projectsTable).values({
      name: "Fondations Immeuble R+4 - Yopougon",
      location: "Yopougon, Abidjan",
      clientName: "SAPIM SA",
      status: "PLANIFIE",
      budgetTotal: "28000000",
      budgetSpent: "0",
      progress: 0,
      startDate: "2024-07-01",
      endDate: "2025-06-30",
    }).returning();

    const personnelData = [
      { name: "Kofi Asante", trade: "Maçon", phone: "+225 07 12 34 56", dailyWage: "15000", contractType: "JOURNALIER" },
      { name: "Ibrahim Ouédraogo", trade: "Électricien", phone: "+225 05 98 76 54", dailyWage: "20000", contractType: "CDI" },
      { name: "Yao Kouamé", trade: "Plombier", phone: "+225 07 45 67 89", dailyWage: "18000", contractType: "CDD" },
      { name: "Seydou Diallo", trade: "Charpentier", phone: "+225 05 11 22 33", dailyWage: "16000", contractType: "JOURNALIER" },
      { name: "Koffi N'Guessan", trade: "Maçon", phone: "+225 07 99 88 77", dailyWage: "15000", contractType: "JOURNALIER" },
      { name: "Adama Coulibaly", trade: "Ferrailleur", phone: "+225 05 44 55 66", dailyWage: "14000", contractType: "JOURNALIER" },
    ];

    for (const p of personnelData) {
      await db.insert(personnelTable).values({
        ...p,
        dailyWage: p.dailyWage,
        contractType: p.contractType as "CDI" | "CDD" | "JOURNALIER",
        isActive: true,
      });
    }
    console.log("Personnel seeded");
    console.log("Sample projects seeded:", project1.name, project2.name, project3.name);
  } else {
    console.log("Database already seeded");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
