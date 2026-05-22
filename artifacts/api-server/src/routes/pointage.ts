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
  // PAR_M2
  surfaceProduced?: string | number | null;
  ratePerSqm?: string | number | null;
  // PRESTATAIRE
  contractAmount?: string | number | null;
  weeklyProgressPct?: number | null;
}) {
  if (entry.status === "ABSENT") return 0;
  const mode = entry.payMode || "PAR_JOUR";

  // PAR_M2 : tarif au m² × surface produite ce jour
  if (mode === "PAR_M2") {
    const surf = parseFloat(String(entry.surfaceProduced || "0"));
    const rate = parseFloat(String(entry.ratePerSqm || "0"));
    return surf * rate;
  }

  // PRESTATAIRE : montant contrat × % évolution sur la semaine
  // (Note : c'est un calcul "instantané" basé sur l'entrée. Le calcul cumulé
  // sera fait côté payroll/week en sommant les entries.)
  if (mode === "PRESTATAIRE") {
    const total = parseFloat(String(entry.contractAmount || "0"));
    const pct = entry.weeklyProgressPct ?? 0;
    return total * (pct / 100);
  }

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

/**
 * Auto-création d'un ouvrier s'il n'existe pas encore.
 * Retourne l'ID du personnel (créé ou existant).
 * Si `personnelId` est fourni → on l'utilise tel quel.
 * Sinon on cherche par téléphone/CNI/nom puis on crée.
 */
async function ensurePersonnel(
  entry: any,
  createdByUserId: number,
): Promise<number | null> {
  // 1) Si déjà lié
  if (entry.personnelId) return parseInt(entry.personnelId);

  // 2) Recherche par téléphone ou idNumber ou nom (case-insensitive)
  const newP = entry.newPersonnel || entry;
  if (!newP?.name) return null;

  // Recherche existant par téléphone (prioritaire) ou idNumber ou nom
  let existing: { id: number }[] = [];
  if (newP.phone) {
    existing = await db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(eq(personnelTable.phone, newP.phone))
      .limit(1);
  }
  if (existing.length === 0 && newP.idNumber) {
    existing = await db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(eq(personnelTable.idNumber, newP.idNumber))
      .limit(1);
  }
  if (existing.length === 0 && newP.name) {
    existing = await db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(sql`LOWER(${personnelTable.name}) = LOWER(${newP.name})`)
      .limit(1);
  }
  if (existing.length > 0) return existing[0].id;

  // 3) Création automatique
  try {
    const [created] = await db.insert(personnelTable).values({
      name: newP.name,
      trade: newP.trade || "Manœuvre",
      phone: newP.phone || null,
      idNumber: newP.idNumber || null,
      emergencyContact: newP.emergencyContact || null,
      address: newP.address || null,
      birthDate: newP.birthDate || null,
      hireDate: newP.hireDate || new Date().toISOString().slice(0, 10),
      notes: newP.notes || null,
      dailyWage: (newP.dailyWage ?? 0).toString(),
      contractType: newP.contractType || "JOURNALIER",
      createdViaPointage: true,
    }).returning();

    await db.insert(activityLogsTable).values({
      userId: createdByUserId,
      action: "CREATE_PERSONNEL_AUTO",
      details: `Ouvrier "${created.name}" créé automatiquement lors du pointage`,
      entityType: "personnel",
      entityId: created.id,
    });
    return created.id;
  } catch (err) {
    // En cas d'erreur (collision unique), on retombe sur la recherche par nom
    const fallback = await db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(sql`LOWER(${personnelTable.name}) = LOWER(${newP.name})`)
      .limit(1);
    return fallback[0]?.id || null;
  }
}

async function recalcSheetTotal(sheetId: number) {
  const totalPayResult = await db.select({ total: sql<string>`COALESCE(SUM(amount_due::numeric), 0)` })
    .from(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, sheetId));
  await db.update(pointageSheetsTable)
    .set({ totalPay: totalPayResult[0]?.total || "0", updatedAt: new Date() })
    .where(eq(pointageSheetsTable.id, sheetId));
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
    const [p] = await db.select({
      name: personnelTable.name,
      dailyWage: personnelTable.dailyWage,
      phone: personnelTable.phone,
      trade: personnelTable.trade,
      idNumber: personnelTable.idNumber,
    }).from(personnelTable).where(eq(personnelTable.id, entry.personnelId)).limit(1);
    return {
      ...entry,
      personnelName: p?.name || "Inconnu",
      personnelPhone: p?.phone || null,
      personnelTrade: p?.trade || null,
      personnelIdNumber: p?.idNumber || null,
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

function canEdit(sheet: typeof pointageSheetsTable.$inferSelect, role: string): boolean {
  if (sheet.locked) return false;
  if (sheet.archived) return false;
  if (role !== "ADMIN" && role !== "CHEF_CHANTIER") return false;
  // Chef + Admin peuvent éditer tant que la fiche n'est pas verrouillée,
  // peu importe le statut (BROUILLON, SOUMISE, REJETEE).
  return sheet.status !== "APPROUVEE";
}

// ─── routes ───────────────────────────────────────────────────────────────────

// GET /api/pointage/workers-for-project/:projectId
router.get("/workers-for-project/:projectId", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    const assigned = await db
      .select({
        id: personnelTable.id,
        name: personnelTable.name,
        trade: personnelTable.trade,
        phone: personnelTable.phone,
        idNumber: personnelTable.idNumber,
        dailyWage: personnelTable.dailyWage,
        isActive: personnelTable.isActive,
        assignedToProject: sql<boolean>`true`,
      })
      .from(personnelProjectsTable)
      .innerJoin(personnelTable, eq(personnelTable.id, personnelProjectsTable.personnelId))
      .where(and(
        eq(personnelProjectsTable.projectId, projectId),
        eq(personnelTable.isActive, true),
        eq(personnelTable.archived, false),
      ));

    if (assigned.length > 0) {
      return res.json(assigned);
    }

    const allPersonnel = await db
      .select({
        id: personnelTable.id,
        name: personnelTable.name,
        trade: personnelTable.trade,
        phone: personnelTable.phone,
        idNumber: personnelTable.idNumber,
        dailyWage: personnelTable.dailyWage,
        isActive: personnelTable.isActive,
        assignedToProject: sql<boolean>`false`,
      })
      .from(personnelTable)
      .where(and(eq(personnelTable.isActive, true), eq(personnelTable.archived, false)));

    res.json(allPersonnel);
  } catch (err) {
    req.log.error({ err }, "Get workers for project error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/pointage/my-history
router.get("/my-history", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
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

// GET /api/pointage — supporte ?archived=true pour ne voir QUE les archivées,
// défaut : uniquement les actives
router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const includeArchived = req.query.archived === "true";
    const onlyArchived = req.query.onlyArchived === "true";

    const filters = [] as any[];
    if (projectId) filters.push(eq(pointageSheetsTable.projectId, projectId));
    if (req.user!.role !== "ADMIN") filters.push(eq(pointageSheetsTable.chefId, req.user!.userId));
    if (onlyArchived) filters.push(eq(pointageSheetsTable.archived, true));
    else if (!includeArchived) filters.push(eq(pointageSheetsTable.archived, false));

    const where = filters.length > 0 ? and(...filters) : undefined;
    const sheets = where
      ? await db.select().from(pointageSheetsTable).where(where).orderBy(pointageSheetsTable.date)
      : await db.select().from(pointageSheetsTable).orderBy(pointageSheetsTable.date);

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
    const { projectId, date, entries, weather, siteLocation, observations, workStartTime, workEndTime } = body;
    if (!projectId || !date) {
      res.status(400).json({ error: "Validation", message: "Projet et date requis" });
      return;
    }

    const [sheet] = await db.insert(pointageSheetsTable).values({
      projectId: parseInt(projectId),
      date,
      chefId: req.user!.userId,
      status: "BROUILLON",
      weather: weather || null,
      siteLocation: siteLocation || null,
      observations: observations || null,
      workStartTime: workStartTime || null,
      workEndTime: workEndTime || null,
    }).returning();

    if (entries && Array.isArray(entries)) {
      for (const entry of entries) {
        const personnelId = await ensurePersonnel(entry, req.user!.userId);
        if (!personnelId) continue;

        const hoursWorked = entry.hoursWorked ?? calcHours(entry.arrivalTime, entry.departureTime);
        const amountDue = calcEntryPay({ ...entry, hoursWorked: hoursWorked?.toString() });

        await db.insert(pointageEntriesTable).values({
          sheetId: sheet.id,
          personnelId,
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          arrivalSignature: entry.arrivalSignature || null,
          arrivalSignedAt: entry.arrivalSignature ? new Date() : null,
          departureTime: entry.departureTime,
          departureSignature: entry.departureSignature || null,
          departureSignedAt: entry.departureSignature ? new Date() : null,
          hoursWorked: hoursWorked?.toString(),
          overtimeHours: entry.overtimeHours?.toString() || "0",
          payMode: entry.payMode || "PAR_JOUR",
          dailyWage: entry.dailyWage?.toString(),
          taskId: entry.taskId ? parseInt(entry.taskId) : null,
          taskAmount: entry.taskAmount?.toString(),
          taskProgressPct: entry.taskProgressPct ?? 100,
          surfaceProduced: entry.surfaceProduced != null ? entry.surfaceProduced.toString() : null,
          ratePerSqm: entry.ratePerSqm != null ? entry.ratePerSqm.toString() : null,
          contractAmount: entry.contractAmount != null ? entry.contractAmount.toString() : null,
          weeklyProgressPct: entry.weeklyProgressPct ?? null,
          amountDue: amountDue.toString(),
          totalPay: amountDue.toString(),
          notes: entry.notes,
        });
      }
      await recalcSheetTotal(sheet.id);
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_POINTAGE",
      details: `Création fiche de pointage - ${date}`,
      entityType: "pointage",
      entityId: sheet.id,
    });

    broadcastRefresh("refresh:pointage");
    const refreshed = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, sheet.id)).limit(1);
    const formatted = await formatSheetWithEntries(refreshed[0]);
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

/**
 * PUT /api/pointage/:id
 * Mise à jour COMPLÈTE ou PARTIELLE d'une fiche.
 * - Chef + Admin uniquement
 * - Possible tant que la fiche n'est PAS verrouillée (locked) ni APPROUVÉE
 * - Si entries fourni → remplace toutes les entries (legacy behavior)
 * - Permet aussi de mettre à jour les méta (weather, observations, etc.)
 */
router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body ?? {};

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }
    if (!canEdit(existing, req.user!.role)) {
      res.status(403).json({ error: "Validation", message: "Cette fiche ne peut plus être modifiée (verrouillée ou approuvée)" });
      return;
    }

    // Mise à jour des champs méta
    const metaUpdates: Partial<typeof pointageSheetsTable.$inferInsert> = {};
    if (body.weather !== undefined) metaUpdates.weather = body.weather;
    if (body.siteLocation !== undefined) metaUpdates.siteLocation = body.siteLocation;
    if (body.observations !== undefined) metaUpdates.observations = body.observations;
    if (body.workStartTime !== undefined) metaUpdates.workStartTime = body.workStartTime;
    if (body.workEndTime !== undefined) metaUpdates.workEndTime = body.workEndTime;
    if (Object.keys(metaUpdates).length > 0) {
      await db.update(pointageSheetsTable)
        .set({ ...metaUpdates, updatedAt: new Date() })
        .where(eq(pointageSheetsTable.id, id));
    }

    // Remplacement complet des entries (mode legacy)
    if (body.entries && Array.isArray(body.entries)) {
      await db.delete(pointageEntriesTable).where(eq(pointageEntriesTable.sheetId, id));
      for (const entry of body.entries) {
        const personnelId = await ensurePersonnel(entry, req.user!.userId);
        if (!personnelId) continue;

        const hoursWorked = entry.hoursWorked ?? calcHours(entry.arrivalTime, entry.departureTime);
        const amountDue = calcEntryPay({ ...entry, hoursWorked: hoursWorked?.toString() });

        await db.insert(pointageEntriesTable).values({
          sheetId: id,
          personnelId,
          status: entry.status || "PRESENT",
          arrivalTime: entry.arrivalTime,
          arrivalSignature: entry.arrivalSignature || null,
          arrivalSignedAt: entry.arrivalSignature ? new Date() : null,
          departureTime: entry.departureTime,
          departureSignature: entry.departureSignature || null,
          departureSignedAt: entry.departureSignature ? new Date() : null,
          hoursWorked: hoursWorked?.toString(),
          overtimeHours: entry.overtimeHours?.toString() || "0",
          payMode: entry.payMode || "PAR_JOUR",
          dailyWage: entry.dailyWage?.toString(),
          taskId: entry.taskId ? parseInt(entry.taskId) : null,
          taskAmount: entry.taskAmount?.toString(),
          taskProgressPct: entry.taskProgressPct ?? 100,
          surfaceProduced: entry.surfaceProduced != null ? entry.surfaceProduced.toString() : null,
          ratePerSqm: entry.ratePerSqm != null ? entry.ratePerSqm.toString() : null,
          contractAmount: entry.contractAmount != null ? entry.contractAmount.toString() : null,
          weeklyProgressPct: entry.weeklyProgressPct ?? null,
          amountDue: amountDue.toString(),
          totalPay: amountDue.toString(),
          notes: entry.notes,
        });
      }
      await recalcSheetTotal(id);
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

/**
 * POST /api/pointage/:id/entries
 * Ajoute UNE entry à une fiche existante.
 * - Auto-créé le personnel si nécessaire (newPersonnel ou personnelId)
 * - Disponible tant que la fiche n'est pas verrouillée
 */
router.post("/:id/entries", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = req.body ?? {};

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }
    if (!canEdit(existing, req.user!.role)) {
      res.status(403).json({ error: "Validation", message: "Cette fiche est verrouillée et ne peut plus être modifiée" });
      return;
    }

    const personnelId = await ensurePersonnel(entry, req.user!.userId);
    if (!personnelId) {
      res.status(400).json({ error: "Validation", message: "Personnel introuvable ou données insuffisantes (nom requis)" });
      return;
    }

    // Empêche les doublons sur la même fiche
    const [dup] = await db
      .select({ id: pointageEntriesTable.id })
      .from(pointageEntriesTable)
      .where(and(eq(pointageEntriesTable.sheetId, id), eq(pointageEntriesTable.personnelId, personnelId)))
      .limit(1);
    if (dup) {
      res.status(409).json({ error: "Conflit", message: "Cet ouvrier est déjà présent sur la fiche" });
      return;
    }

    const hoursWorked = entry.hoursWorked ?? calcHours(entry.arrivalTime, entry.departureTime);
    const amountDue = calcEntryPay({ ...entry, hoursWorked: hoursWorked?.toString() });

    const [newEntry] = await db.insert(pointageEntriesTable).values({
      sheetId: id,
      personnelId,
      status: entry.status || "PRESENT",
      arrivalTime: entry.arrivalTime || null,
      arrivalSignature: entry.arrivalSignature || null,
      arrivalSignedAt: entry.arrivalSignature ? new Date() : null,
      departureTime: entry.departureTime || null,
      departureSignature: entry.departureSignature || null,
      departureSignedAt: entry.departureSignature ? new Date() : null,
      hoursWorked: hoursWorked?.toString(),
      overtimeHours: entry.overtimeHours?.toString() || "0",
      payMode: entry.payMode || "PAR_JOUR",
      dailyWage: entry.dailyWage?.toString(),
      taskId: entry.taskId ? parseInt(entry.taskId) : null,
      taskAmount: entry.taskAmount?.toString(),
      taskProgressPct: entry.taskProgressPct ?? 100,
      amountDue: amountDue.toString(),
      totalPay: amountDue.toString(),
      notes: entry.notes || null,
    }).returning();

    await recalcSheetTotal(id);
    broadcastRefresh("refresh:pointage");

    res.status(201).json({ success: true, entryId: newEntry.id, personnelId });
  } catch (err) {
    req.log.error({ err }, "Add entry error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'ajout de l'ouvrier" });
  }
});

/**
 * DELETE /api/pointage/:id/entries/:entryId
 * Supprime une entry d'une fiche non verrouillée.
 */
router.delete("/:id/entries/:entryId", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Fiche non trouvée" });
      return;
    }
    if (!canEdit(existing, req.user!.role)) {
      res.status(403).json({ error: "Validation", message: "Fiche verrouillée" });
      return;
    }

    await db.delete(pointageEntriesTable).where(eq(pointageEntriesTable.id, entryId));
    await recalcSheetTotal(id);
    broadcastRefresh("refresh:pointage");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete entry error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * POST /api/pointage/:id/entries/:entryId/sign
 * Signature a posteriori (arrivée ou départ) pour une entry.
 * Body : { type: "arrival" | "departure", signatureData: string }
 */
router.post("/:id/entries/:entryId/sign", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const { type, signatureData } = req.body ?? {};

    if (!signatureData || (type !== "arrival" && type !== "departure")) {
      res.status(400).json({ error: "Validation", message: "type (arrival/departure) et signatureData requis" });
      return;
    }

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    if (existing.locked || existing.archived) {
      res.status(403).json({ error: "Validation", message: "Fiche verrouillée — signature impossible" });
      return;
    }

    const updates: any = { };
    if (type === "arrival") {
      updates.arrivalSignature = signatureData;
      updates.arrivalSignedAt = new Date();
    } else {
      updates.departureSignature = signatureData;
      updates.departureSignedAt = new Date();
    }

    await db.update(pointageEntriesTable).set(updates).where(eq(pointageEntriesTable.id, entryId));
    broadcastRefresh("refresh:pointage");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Sign entry error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * PUT /api/pointage/:id/entries/:entryId
 * Mise à jour d'UNE entry (utile pour ne pas tout réécrire en cas d'édition ciblée).
 */
router.put("/:id/entries/:entryId", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const body = req.body ?? {};

    const [existing] = await db.select().from(pointageSheetsTable).where(eq(pointageSheetsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    if (!canEdit(existing, req.user!.role)) {
      res.status(403).json({ error: "Validation", message: "Fiche verrouillée" });
      return;
    }

    const hoursWorked = body.hoursWorked ?? calcHours(body.arrivalTime, body.departureTime);
    const amountDue = calcEntryPay({ ...body, hoursWorked: hoursWorked?.toString() });

    const updates: any = { };
    if (body.status !== undefined) updates.status = body.status;
    if (body.arrivalTime !== undefined) updates.arrivalTime = body.arrivalTime;
    if (body.departureTime !== undefined) updates.departureTime = body.departureTime;
    if (hoursWorked !== undefined && hoursWorked !== null) updates.hoursWorked = hoursWorked.toString();
    if (body.overtimeHours !== undefined) updates.overtimeHours = body.overtimeHours.toString();
    if (body.payMode !== undefined) updates.payMode = body.payMode;
    if (body.dailyWage !== undefined) updates.dailyWage = body.dailyWage?.toString();
    if (body.taskId !== undefined) updates.taskId = body.taskId ? parseInt(body.taskId) : null;
    if (body.taskAmount !== undefined) updates.taskAmount = body.taskAmount?.toString();
    if (body.taskProgressPct !== undefined) updates.taskProgressPct = body.taskProgressPct;
    if (body.surfaceProduced !== undefined) updates.surfaceProduced = body.surfaceProduced != null ? body.surfaceProduced.toString() : null;
    if (body.ratePerSqm !== undefined) updates.ratePerSqm = body.ratePerSqm != null ? body.ratePerSqm.toString() : null;
    if (body.contractAmount !== undefined) updates.contractAmount = body.contractAmount != null ? body.contractAmount.toString() : null;
    if (body.weeklyProgressPct !== undefined) updates.weeklyProgressPct = body.weeklyProgressPct;
    if (body.notes !== undefined) updates.notes = body.notes;
    updates.amountDue = amountDue.toString();
    updates.totalPay = amountDue.toString();

    await db.update(pointageEntriesTable).set(updates).where(eq(pointageEntriesTable.id, entryId));
    await recalcSheetTotal(id);
    broadcastRefresh("refresh:pointage");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Update entry error");
    res.status(500).json({ error: "Erreur serveur" });
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

/**
 * POST /api/pointage/:id/archive
 * POST /api/pointage/:id/unarchive
 * Admin uniquement — bascule l'état archivé d'une fiche.
 */
router.post("/:id/archive", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    const id = parseInt(req.params.id);
    const [sheet] = await db.update(pointageSheetsTable)
      .set({ archived: true, archivedAt: new Date(), archivedBy: req.user!.userId, updatedAt: new Date() })
      .where(eq(pointageSheetsTable.id, id))
      .returning();
    if (!sheet) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    broadcastRefresh("refresh:pointage");
    res.json({ success: true, archived: true });
  } catch (err) {
    req.log.error({ err }, "Archive pointage error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/:id/unarchive", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    const id = parseInt(req.params.id);
    const [sheet] = await db.update(pointageSheetsTable)
      .set({ archived: false, archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(eq(pointageSheetsTable.id, id))
      .returning();
    if (!sheet) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    broadcastRefresh("refresh:pointage");
    res.json({ success: true, archived: false });
  } catch (err) {
    req.log.error({ err }, "Unarchive pointage error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
