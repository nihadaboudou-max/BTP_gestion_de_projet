import { Router } from "express";
import { db } from "@workspace/db";
import { personnelTable, activityLogsTable, pointageEntriesTable, pointageSheetsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";

const router = Router();

async function formatPersonnel(p: typeof personnelTable.$inferSelect) {
  const daysResult = await db.select({ count: sql<number>`COUNT(*)` })
    .from(pointageEntriesTable)
    .where(eq(pointageEntriesTable.personnelId, p.id));

  const payResult = await db.select({ total: sql<string>`COALESCE(SUM(total_pay::numeric), 0)` })
    .from(pointageEntriesTable)
    .where(eq(pointageEntriesTable.personnelId, p.id));

  return {
    ...p,
    dailyWage: parseFloat(p.dailyWage as string),
    totalDaysWorked: Number(daysResult[0]?.count || 0),
    totalPayOwed: parseFloat(payResult[0]?.total || "0"),
    projectIds: [],
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const personnel = await db.select().from(personnelTable).orderBy(personnelTable.name);
    const result = await Promise.all(personnel.map(formatPersonnel));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List personnel error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération du personnel" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { role: userRole, userId } = req.user!;
    if (userRole !== "ADMIN") {
      const { usersTable } = await import("@workspace/db");
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u?.canAddWorkers) {
        res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante pour ajouter du personnel" });
        return;
      }
    }

    const body = req.body ?? {};
    const { name, phone, emergencyContact, dailyWage, contractType } = body;
    const trade = body.trade || body.speciality;
    const idNumber = body.idNumber || body.nationalId;
    const safeContractType = (contractType === "FREELANCE") ? "CDD" : contractType;

    if (!name || !trade || !dailyWage || !safeContractType) {
      res.status(400).json({ error: "Validation", message: "Nom, métier, salaire journalier et type de contrat requis" });
      return;
    }

    const [personnel] = await db.insert(personnelTable).values({
      name, trade, phone, idNumber, emergencyContact,
      dailyWage: dailyWage.toString(),
      contractType: safeContractType,
    }).returning();

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_PERSONNEL",
      details: `Ajout de l'ouvrier "${name}"`,
      entityType: "personnel",
      entityId: personnel.id,
    });

    const formatted = await formatPersonnel(personnel);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create personnel error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création du personnel" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, trade, phone, idNumber, emergencyContact, dailyWage, contractType, isActive } = req.body ?? {};

    const updates: Partial<typeof personnelTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (trade !== undefined) updates.trade = trade;
    if (phone !== undefined) updates.phone = phone;
    if (idNumber !== undefined) updates.idNumber = idNumber;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (dailyWage !== undefined) updates.dailyWage = dailyWage.toString();
    if (contractType !== undefined) updates.contractType = contractType;
    if (isActive !== undefined) updates.isActive = isActive;

    const [personnel] = await db.update(personnelTable).set({ ...updates, updatedAt: new Date() }).where(eq(personnelTable.id, id)).returning();
    if (!personnel) {
      res.status(404).json({ error: "Non trouvé", message: "Personnel non trouvé" });
      return;
    }

    const formatted = await formatPersonnel(personnel);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update personnel error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour du personnel" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { role: userRole, userId } = req.user!;
    if (userRole !== "ADMIN") {
      const { usersTable } = await import("@workspace/db");
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u?.canDeleteWorkers) {
        res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante" });
        return;
      }
    }
    const id = parseInt(req.params.id);
    const [personnel] = await db.delete(personnelTable).where(eq(personnelTable.id, id)).returning();
    if (!personnel) {
      res.status(404).json({ error: "Non trouvé", message: "Personnel non trouvé" });
      return;
    }
    res.json({ success: true, message: "Personnel supprimé" });
  } catch (err) {
    req.log.error({ err }, "Delete personnel error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression du personnel" });
  }
});

export default router;
