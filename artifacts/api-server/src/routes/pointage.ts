import { Router } from "express";
import { db } from "@workspace/db";
import { pointageSheetsTable, pointageEntriesTable, personnelTable, personnelProjectsTable, projectsTable, usersTable, activityLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification, notifyAdmins, broadcastRefresh } from "../lib/notifications.js";

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

function calcHours(arrival: string | null | undefined, departure: string | null | undefined): number | null {
  if (!arrival || !departure) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const diff = toMin(departure) - toMin(arrival);
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : null;
}

function calcEntryPay(entry: {
  status: string;
  payMode?: string | null;
  hoursWorked?: string | null;
  overtimeHours?: string | null;
  dailyWage?: string | null;
  taskAmount?: string | null;
  taskProgressPct?: number | null;
}) {
  if (entry.status === "ABSENT") return 0;
  const mode = entry.payMode || "PAR_JOUR";
  if (mode === "PAR_TACHE") {
    const taskAmt = parseFloat(entry.taskAmount || "0");
    const pct = entry.taskProgressPct ?? 100;
    return taskAmt * (pct / 100);
  }
  const wage = parseFloat(entry.dailyWage || "0");
  const hours = parseFloat(entry.hoursWorked || "0");
  const overtime = parseFloat(entry.overtimeHours || "0");
  if (entry.status === "DEMI_JOURNEE") return wage / 2;
  if (entry.status === "HEURE_SUP") {
    const normalPay = hours > 0 ? (hours - overtime) * (wage / 8) : wage;
    const overtimePay = overtime * (wage / 8) * 1.5;
    return normalPay + overtimePay;
  }
  if (hours > 0) return hours * (wage / 8);
  return wage;
}

async function formatSheet(sheet: typeof pointageSheetsTable.$inferSelect) {
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, sheet.projectId)).limit(1);
  const [c] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sheet.chefId)).limit(1);
  return {
    ...sheet,
    projectName: p?.name,
    chefName: c?.name,
    totalPay: parseFloat(sheet.totalPay as string),
  };
}

async function formatSheetWithEntries(sheet: typeof pointageSheetsTable.$inferSelect) {
  const formatted = await formatSheet(sheet);
  const entries = await db.select().from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, sheet.id));
  const formattedEntries = await Promise.all(entries.map(async (entry) => {
    const [p] = await db.select({ name: personnelTable.name, dailyWage: personnelTable.dailyWage }).from(personnelTable).where(eq(personnelTable.id, entry.personnelId)).limit(1);
    return {
      ...entry,
      personnelName: p?.name || "Inconnu",
      defaultDailyWage: p?.dailyWage ? parseFloat(p.dailyWage as string) : null,
      hoursWorked: entry.hoursWorked ? parseFloat(entry.hoursWorked as string) : null,
      overtimeHours: entry.overtimeHours ? parseFloat(entry.overtimeHours as string) : 0,
      dailyWage: entry.dailyWage ? parseFloat(entry.dailyWage as string) : null,
      taskAmount: entry.taskAmount ? parseFloat(entry.taskAmount as string) : null,
      amountDue: entry.amountDue ? parseFloat(entry.amountDue as string) : null,
      totalPay: entry.totalPay ? parseFloat(entry.totalPay as string) : null,
    };
  }));
  return { ...formatted, entries: formattedEntries };
}

// ─── routes ───────────────────────────────────────────────────────────────────

// GET /api/pointage/workers-for-project/:projectId — list all active personnel
// Returns personnel assigned to the project, or ALL active personnel as fallback
router.get("/workers-for-project/:projectId", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // First try to get personnel assigned to this project
    const assigned = await db
      .select({
        id: personnelTable.id,
        name: personnelTable.name,
        trade: personnelTable.trade,
        dailyWage: personnelTable.dailyWage,
        isActive: personnelTable.isActive,
        assignedToProject: sql<boolean>`true`,
      })
      .from(personnelProjectsTable)
      .innerJoin(personnelTable, eq(personnelTable.id, personnelProjectsTable.personnelId))
      .where(and(eq(personnelProjectsTable.projectId, projectId), eq(personnelTable.isActive, true)));

    if (assigned.length > 0) {
      return res.json(assigned);
    }

    // Fallback: return ALL active personnel with a flag so frontend can show them
    const allPersonnel = await db
      .select({
        id: personnelTable.id,
        name: personnelTable.name,
        trade: personnelTable.trade,
        dailyWage: personnelTable.dailyWage,
        isActive: personnelTable.isActive,
        assignedToProject: sql<boolean>`false`,
      })
      .from(personnelTable)
      .where(eq(personnelTable.isActive, true));

    res.json(allPersonnel);
  } catch (err) {
    req.log.error({ err }, "Get workers for project error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/pointage/my-history — worker's own pointage history (read-only)
router.get("/my-history", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    // Find all entries where this worker appears as personnelId
    // We need to cross-reference personnel table to find if this user has a personnel record
    const entries = await db
      .select({
        sheetId: pointageEntriesTable.sheetId,
        entryId: pointageEntriesTable.id,
        status: pointageEntriesTable.status,
        arrivalTime: pointageEntriesTable.arrivalTime,
        departureTime: pointageEntriesTable.departureTime,
        hoursWorked: pointageEntriesTable.hoursWorked,
        payMode: pointageEntriesTable.payMode,
        amountDue: pointageEntriesTable.amountDue,
        notes: pointageEntriesTable.notes,
      })
      .from(pointageEntriesTable)
      .innerJoin(personnelTable, eq(personnelTable.id, pointageEntriesTable.personnelId))
      .where(sql`LOWER(${personnelTable.name}) = LOWER((SELECT name FROM users WHERE id = ${userId} LIMIT 1))`);

    // Get unique sheet IDs
    const sheetIds = [...new Set(entries.map(e => e.sheetId))];
    if (sheetIds.length === 0) return res.json([]);

    const sheets = await db
      .select()
      .from(pointageSheetsTable)
      .where(sql`${pointageSheetsTable.id} = ANY(${sql`ARRAY[${sql.join(sheetIds.map(id => sql`${id}`), sql`, `)}]::int[]`})`);

    const result = await Promise.all(sheets.map(async (sheet) => {
      const formatted = await formatSheet(sheet);
      const myEntry = entries.find(e => e.sheetId === sheet.id);
      return {
        ...formatted,
        myEntry: myEntry ? {
          ...myEntry,
          hoursWorked: myEntry.hoursWorked ? parseFloat(myEntry.hoursWorked as string) : null,
          amountDue: myEntry.amountDue ? parseFloat(myEntry.amountDue as string) : null,
        } : null,
      };
    }));

    res.json(result.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  } catch (err) {
    req.log.error({ err }, "My history error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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
        const hoursWorked = entry.hoursWorked ?? calcHours(entry.arrivalTime, entry.departureTime);
        const amountDue = calcEntryPay({ ...entry, hoursWorked: hoursWorked?.toString() });

        await db.insert(pointageEntriesTable).values({
          sheetId: sheet.id,
          personnelId: parseInt(entry.personnelId),
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          departureTime: entry.departureTime,
          hoursWorked: hoursWorked?.toString(),
          overtimeHours: entry.overtimeHours?.toString() || "0",
          payMode: entry.payMode || "PAR_JOUR",
          dailyWage: entry.dailyWage?.toString(),
          taskId: entry.taskId ? parseInt(entry.taskId) : null,
          taskAmount: entry.taskAmount?.toString(),
          taskProgressPct: entry.taskProgressPct ?? 100,
          amountDue: amountDue.toString(),
          totalPay: amountDue.toString(),
          notes: entry.notes,
        });
      }

      const totalPayResult = await db.select({ total: sql<string>`COALESCE(SUM(amount_due::numeric), 0)` })
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

    broadcastRefresh("refresh:pointage");
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
    if (existing.locked) {
      res.status(400).json({ error: "Validation", message: "Cette fiche est verrouillée et ne peut plus être modifiée" });
      return;
    }
    if (existing.status !== "BROUILLON") {
      res.status(400).json({ error: "Validation", message: "La fiche soumise ne peut pas être modifiée" });
      return;
    }

    if (entries && Array.isArray(entries)) {
      await db.delete(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, id));
      for (const entry of entries) {
        const hoursWorked = entry.hoursWorked ?? calcHours(entry.arrivalTime, entry.departureTime);
        const amountDue = calcEntryPay({ ...entry, hoursWorked: hoursWorked?.toString() });

        await db.insert(pointageEntriesTable).values({
          sheetId: id,
          personnelId: parseInt(entry.personnelId),
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          departureTime: entry.departureTime,
          hoursWorked: hoursWorked?.toString(),
          overtimeHours: entry.overtimeHours?.toString() || "0",
          payMode: entry.payMode || "PAR_JOUR",
          dailyWage: entry.dailyWage?.toString(),
          taskId: entry.taskId ? parseInt(entry.taskId) : null,
          taskAmount: entry.taskAmount?.toString(),
          taskProgressPct: entry.taskProgressPct ?? 100,
          amountDue: amountDue.toString(),
          totalPay: amountDue.toString(),
          notes: entry.notes,
        });
      }

      const totalPayResult = await db.select({ total: sql<string>`COALESCE(SUM(amount_due::numeric), 0)` })
        .from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, id));
      await db.update(pointageSheetsTable).set({ totalPay: totalPayResult[0]?.total || "0", updatedAt: new Date() }).where(eq(pointageSheetsTable.id, id));
    }

    broadcastRefresh("refresh:pointage");
    const [sheet] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de la fiche" });
  }
});

// Sign chef signature on a sheet
router.post("/:id/sign-chef", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { signatureData } = req.body ?? {};
    if (!signatureData) {
      res.status(400).json({ error: "Validation", message: "Données de signature requises" });
      return;
    }

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }

    const [sheet] = await db.update(pointageSheetsTable).set({
      chefSignature: signatureData,
      chefSignedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(pointageSheetsTable.id, id)).returning();

    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Sign chef error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la signature" });
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
      .set({ status: "SOUMISE", signatureData, chefSignature: signatureData, chefSignedAt: new Date(), submittedAt: new Date(), updatedAt: new Date() })
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

    broadcastRefresh("refresh:pointage");
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
      .set({
        status: approved ? "APPROUVEE" : "REJETEE",
        locked: approved ? true : false,
        adminComment: comment,
        updatedAt: new Date(),
      })
      .where(eq(pointageSheetsTable.id, id))
      .returning();

    await createNotification({
      userId: existing.chefId,
      type: approved ? "POINTAGE_APPROVED" : "POINTAGE_REJECTED",
      title: approved ? "Fiche de pointage approuvée" : "Fiche de pointage rejetée",
      message: approved ? `Votre fiche du ${existing.date} a été approuvée` : `Votre fiche du ${existing.date} a été rejetée${comment ? ` : ${comment}` : ""}`,
      relatedId: id,
      relatedType: "pointage",
    });

    broadcastRefresh("refresh:pointage");
    const formatted = await formatSheetWithEntries(sheet);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Approve pointage error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'approbation de la fiche" });
  }
});

export default router;
