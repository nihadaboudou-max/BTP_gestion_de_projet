import { Router } from "express";
import { db } from "@workspace/db";
import { pointageSheetsTable, pointageEntriesTable, personnelTable, projectsTable, usersTable, activityLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification, notifyAdmins } from "../lib/notifications.js";

const router = Router();

async function formatSheet(sheet: typeof pointageSheetsTable.$inferSelect) {
  let projectName: string | undefined;
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, sheet.projectId)).limit(1);
  projectName = p?.name;

  let chefName: string | undefined;
  const [c] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sheet.chefId)).limit(1);
  chefName = c?.name;

  return {
    ...sheet,
    projectName,
    chefName,
    totalPay: parseFloat(sheet.totalPay as string),
  };
}

async function formatSheetWithEntries(sheet: typeof pointageSheetsTable.$inferSelect) {
  const formatted = await formatSheet(sheet);
  const entries = await db.select().from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, sheet.id));
  const formattedEntries = await Promise.all(entries.map(async (entry) => {
    const [p] = await db.select({ name: personnelTable.name }).from(personnelTable).where(eq(personnelTable.id, entry.personnelId)).limit(1);
    return {
      ...entry,
      personnelName: p?.name || "Inconnu",
      hoursWorked: entry.hoursWorked ? parseFloat(entry.hoursWorked as string) : null,
      dailyWage: entry.dailyWage ? parseFloat(entry.dailyWage as string) : null,
      totalPay: entry.totalPay ? parseFloat(entry.totalPay as string) : null,
    };
  }));
  return { ...formatted, entries: formattedEntries };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    let sheets;

    if (req.user!.role === "ADMIN") {
      sheets = projectId
        ? await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.projectId, projectId)).orderBy(pointageSheetsTable.date)
        : await db.select().from(pointageSheetsTable).orderBy(pointageSheetsTable.date);
    } else {
      sheets = projectId
        ? await db.select().from(pointageSheetsTable).where(and(eq(pointageSheetsTable.projectId, projectId), eq(pointageSheetsTable.chefId, req.user!.userId))).orderBy(pointageSheetsTable.date)
        : await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.chefId, req.user!.userId)).orderBy(pointageSheetsTable.date);
    }

    const result = await Promise.all(sheets.map(formatSheet));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des fiches de pointage" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const body = req.body ?? {};
    const { projectId, date, entries } = body;
    if (!projectId || !date) {
      res.status(400).json({ error: "Validation", message: "Projet et date requis" });
      return;
    }

    const [sheet] = await db.insert(pointageSheetsTable).values({
      projectId: parseInt(projectId),
      date,
      chefId: req.user!.userId,
      status: "BROUILLON",
    }).returning();

    if (entries && Array.isArray(entries)) {
      for (const entry of entries) {
        const totalPay = entry.status === "ABSENT" ? 0 :
          entry.status === "DEMI_JOURNEE" ? (parseFloat(entry.dailyWage || "0") / 2) :
          (parseFloat(entry.hoursWorked || "0") > 0 ? parseFloat(entry.hoursWorked) * (parseFloat(entry.dailyWage || "0") / 8) : parseFloat(entry.dailyWage || "0"));

        await db.insert(pointageEntriesTable).values({
          sheetId: sheet.id,
          personnelId: parseInt(entry.personnelId),
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          departureTime: entry.departureTime,
          hoursWorked: entry.hoursWorked?.toString(),
          dailyWage: entry.dailyWage?.toString(),
          totalPay: totalPay.toString(),
          notes: entry.notes,
        });
      }

      const totalPayResult = await db.select({ total: sql<string>`COALESCE(SUM(total_pay::numeric), 0)` })
        .from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, sheet.id));
      await db.update(pointageSheetsTable).set({ totalPay: totalPayResult[0]?.total || "0" }).where(eq(pointageSheetsTable.id, sheet.id));
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_POINTAGE",
      details: `Création fiche de pointage - ${date}`,
      entityType: "pointage",
      entityId: sheet.id,
    });

    const formatted = await formatSheetWithEntries(sheet);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création de la fiche de pointage" });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [sheet] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!sheet) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche de pointage non trouvée" });
      return;
    }
    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Get pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération de la fiche" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { entries } = req.body ?? {};

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }
    if (existing.status !== "BROUILLON") {
      res.status(400).json({ error: "Validation", message: "La fiche soumise ne peut pas être modifiée" });
      return;
    }

    if (entries && Array.isArray(entries)) {
      await db.delete(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, id));
      for (const entry of entries) {
        const totalPay = entry.status === "ABSENT" ? 0 :
          entry.status === "DEMI_JOURNEE" ? (parseFloat(entry.dailyWage || "0") / 2) :
          parseFloat(entry.dailyWage || "0");

        await db.insert(pointageEntriesTable).values({
          sheetId: id,
          personnelId: parseInt(entry.personnelId),
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          departureTime: entry.departureTime,
          hoursWorked: entry.hoursWorked?.toString(),
          dailyWage: entry.dailyWage?.toString(),
          totalPay: totalPay.toString(),
          notes: entry.notes,
        });
      }

      const totalPayResult = await db.select({ total: sql<string>`COALESCE(SUM(total_pay::numeric), 0)` })
        .from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, id));
      await db.update(pointageSheetsTable).set({ totalPay: totalPayResult[0]?.total || "0", updatedAt: new Date() }).where(eq(pointageSheetsTable.id, id));
    }

    const [sheet] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de la fiche" });
  }
});

router.post("/:id/submit", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { signatureData } = req.body ?? {};
    if (!signatureData) {
      res.status(400).json({ error: "Validation", message: "Signature requise pour soumettre la fiche" });
      return;
    }

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }

    const [sheet] = await db.update(pointageSheetsTable)
      .set({ status: "SOUMISE", signatureData, submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(pointageSheetsTable.id, id))
      .returning();

    const [project] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, existing.projectId)).limit(1);

    await notifyAdmins(db, {
      type: "POINTAGE_SUBMITTED",
      title: "Nouvelle fiche de pointage soumise",
      message: `Nouvelle fiche de pointage soumise — ${project?.name || "Projet"} — ${existing.date}`,
      relatedId: id,
      relatedType: "pointage",
    });

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "SUBMIT_POINTAGE",
      details: `Soumission de la fiche de pointage #${id}`,
      entityType: "pointage",
      entityId: id,
    });

    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Submit pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la soumission de la fiche" });
  }
});

router.post("/:id/approve", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Accès refusé", message: "Seul l'administrateur peut approuver les fiches" });
      return;
    }

    const id = parseInt(req.params.id);
    const { approved, comment } = req.body ?? {};

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }

    const [sheet] = await db.update(pointageSheetsTable)
      .set({ status: approved ? "APPROUVEE" : "REJETEE", adminComment: comment, updatedAt: new Date() })
      .where(eq(pointageSheetsTable.id, id))
      .returning();

    await createNotification({
      userId: existing.chefId,
      type: approved ? "POINTAGE_APPROVED" : "POINTAGE_REJECTED",
      title: approved ? "Fiche de pointage approuvée" : "Fiche de pointage rejetée",
      message: approved ? `Votre fiche du ${existing.date} a été approuvée` : `Votre fiche du ${existing.date} a été rejetée${comment ? `: ${comment}` : ""}`,
      relatedId: id,
      relatedType: "pointage",
    });

    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Approve pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'approbation de la fiche" });
  }
});

export default router;
