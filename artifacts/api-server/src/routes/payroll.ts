/**
 * Routes /api/payroll
 *
 * Module de paie hebdomadaire : agrégation par ouvrier sur une période,
 * enregistrement des paiements, historique.
 *
 * - GET  /api/payroll/week?start=YYYY-MM-DD&end=YYYY-MM-DD
 *        → liste des ouvriers avec jours/heures/montant dû/payé/solde
 * - POST /api/payroll/pay
 *        → enregistre un paiement
 * - GET  /api/payroll/history?personnelId=...
 *        → historique des paiements (filtres optionnels)
 * - DELETE /api/payroll/:id
 *        → annule un paiement (admin uniquement)
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  paymentsTable, personnelTable, pointageEntriesTable, pointageSheetsTable,
  projectsTable, activityLogsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";

const router = Router();

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Retourne le lundi de la semaine ISO contenant `d` (00h00 local) */
function getWeekStart(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=dim, 1=lun, ...
  const diff = (day === 0 ? -6 : 1 - day); // ramène au lundi
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function getWeekEnd(start: Date): Date {
  const dt = new Date(start);
  dt.setDate(dt.getDate() + 6); // dimanche
  return dt;
}

// ─── GET /api/payroll/week ────────────────────────────────────────────────
// Retourne pour chaque ouvrier ayant pointé sur la période :
// { personnelId, name, trade, daysWorked, totalHours, totalAmount, alreadyPaid, balance, breakdown }
router.get("/week", authenticate, async (req: AuthRequest, res) => {
  try {
    let startDate: Date;
    let endDate: Date;

    if (req.query.start) {
      startDate = new Date(req.query.start as string);
    } else {
      startDate = getWeekStart(new Date());
    }
    if (req.query.end) {
      endDate = new Date(req.query.end as string);
    } else {
      endDate = getWeekEnd(startDate);
    }

    const startStr = toISODate(startDate);
    const endStr = toISODate(endDate);

    // Récupère toutes les entries du personnel pour les fiches de la période
    const entries = await db
      .select({
        personnelId: pointageEntriesTable.personnelId,
        personnelName: personnelTable.name,
        personnelTrade: personnelTable.trade,
        personnelPhone: personnelTable.phone,
        personnelIdNumber: personnelTable.idNumber,
        status: pointageEntriesTable.status,
        hoursWorked: pointageEntriesTable.hoursWorked,
        overtimeHours: pointageEntriesTable.overtimeHours,
        arrivalTime: pointageEntriesTable.arrivalTime,
        departureTime: pointageEntriesTable.departureTime,
        arrivalSignature: pointageEntriesTable.arrivalSignature,
        departureSignature: pointageEntriesTable.departureSignature,
        amountDue: pointageEntriesTable.amountDue,
        sheetDate: pointageSheetsTable.date,
        sheetId: pointageSheetsTable.id,
        entryId: pointageEntriesTable.id,
        projectId: pointageSheetsTable.projectId,
        projectName: projectsTable.name,
      })
      .from(pointageEntriesTable)
      .innerJoin(pointageSheetsTable, eq(pointageSheetsTable.id, pointageEntriesTable.sheetId))
      .innerJoin(personnelTable, eq(personnelTable.id, pointageEntriesTable.personnelId))
      .leftJoin(projectsTable, eq(projectsTable.id, pointageSheetsTable.projectId))
      .where(and(
        gte(pointageSheetsTable.date, startStr),
        lte(pointageSheetsTable.date, endStr),
      ));

    // Récupère les paiements déjà effectués sur la période (même chevauchement)
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(and(
        // Considère un paiement comme "pour cette semaine" si sa période couvre OU recoupe la semaine demandée
        gte(paymentsTable.periodEnd, startStr),
        lte(paymentsTable.periodStart, endStr),
      ));

    // Agrège par ouvrier
    const byWorker = new Map<number, any>();
    for (const e of entries) {
      if (!byWorker.has(e.personnelId)) {
        byWorker.set(e.personnelId, {
          personnelId: e.personnelId,
          name: e.personnelName,
          trade: e.personnelTrade,
          phone: e.personnelPhone,
          idNumber: e.personnelIdNumber,
          daysWorked: 0,
          totalHours: 0,
          totalOvertimeHours: 0,
          totalAmount: 0,
          alreadyPaid: 0,
          balance: 0,
          signedCount: 0,
          totalEntries: 0,
          breakdown: [],
          paymentIds: [],
        });
      }
      const w = byWorker.get(e.personnelId);
      const status = e.status;
      const isPaidDay = status !== "ABSENT";
      const dayCount = status === "DEMI_JOURNEE" ? 0.5 : (isPaidDay ? 1 : 0);
      const overtime = parseFloat((e.overtimeHours as string | null) || "0");
      const hasArrSig = !!e.arrivalSignature;
      const hasDepSig = !!e.departureSignature;
      w.daysWorked += dayCount;
      w.totalHours += parseFloat((e.hoursWorked as string | null) || "0");
      w.totalOvertimeHours += overtime;
      w.totalAmount += parseFloat((e.amountDue as string | null) || "0");
      w.totalEntries += 1;
      if (hasArrSig || hasDepSig) w.signedCount += 1;
      w.breakdown.push({
        date: e.sheetDate,
        sheetId: e.sheetId,
        entryId: e.entryId,
        projectId: e.projectId,
        projectName: e.projectName,
        status,
        hours: parseFloat((e.hoursWorked as string | null) || "0"),
        overtimeHours: overtime,
        arrivalTime: e.arrivalTime,
        departureTime: e.departureTime,
        arrivalSigned: hasArrSig,
        departureSigned: hasDepSig,
        amount: parseFloat((e.amountDue as string | null) || "0"),
      });
    }

    // Ajoute les paiements déjà faits
    for (const p of payments) {
      const w = byWorker.get(p.personnelId);
      if (!w) continue;
      const amt = parseFloat(p.amount as string);
      w.alreadyPaid += amt;
      w.paymentIds.push({ id: p.id, amount: amt, date: p.paymentDate, method: p.paymentMethod, reference: p.reference });
    }

    // Calcule le solde
    for (const w of byWorker.values()) {
      w.balance = w.totalAmount - w.alreadyPaid;
      // Tri du breakdown par date
      w.breakdown.sort((a: any, b: any) => a.date.localeCompare(b.date));
    }

    const result = Array.from(byWorker.values())
      .sort((a, b) => b.balance - a.balance); // ceux qui ont le plus à recevoir en premier

    res.json({
      periodStart: startStr,
      periodEnd: endStr,
      workers: result,
      summary: {
        totalDue: result.reduce((s, w) => s + w.totalAmount, 0),
        totalPaid: result.reduce((s, w) => s + w.alreadyPaid, 0),
        totalBalance: result.reduce((s, w) => s + w.balance, 0),
        totalHours: result.reduce((s, w) => s + w.totalHours, 0),
        totalOvertimeHours: result.reduce((s, w) => s + w.totalOvertimeHours, 0),
        totalDays: result.reduce((s, w) => s + w.daysWorked, 0),
        workerCount: result.length,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Get payroll week error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors du calcul de la paie" });
  }
});

// ─── POST /api/payroll/pay ────────────────────────────────────────────────
router.post("/pay", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante" });
      return;
    }
    const body = req.body ?? {};
    const { personnelId, periodStart, periodEnd, amount, paymentMethod, reference, notes, paymentDate } = body;

    if (!personnelId || !periodStart || !periodEnd || amount === undefined || amount === null) {
      res.status(400).json({ error: "Validation", message: "personnelId, periodStart, periodEnd et amount sont requis" });
      return;
    }
    if (parseFloat(amount) <= 0) {
      res.status(400).json({ error: "Validation", message: "Le montant doit être > 0" });
      return;
    }

    const [payment] = await db.insert(paymentsTable).values({
      personnelId: parseInt(personnelId),
      periodStart,
      periodEnd,
      amount: amount.toString(),
      paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: paymentMethod || "CASH",
      reference: reference || null,
      notes: notes || null,
      paidBy: req.user!.userId,
    }).returning();

    // Récupère le nom de l'ouvrier pour le log
    const [p] = await db.select({ name: personnelTable.name }).from(personnelTable).where(eq(personnelTable.id, personnelId)).limit(1);

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "PAY_WORKER",
      details: `Paiement de ${amount} FCFA à ${p?.name || "Ouvrier #" + personnelId} (semaine ${periodStart} → ${periodEnd})`,
      entityType: "payment",
      entityId: payment.id,
    });

    res.status(201).json({ ...payment, amount: parseFloat(payment.amount as string) });
  } catch (err) {
    req.log.error({ err }, "Pay worker error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'enregistrement du paiement" });
  }
});

// ─── GET /api/payroll/history ─────────────────────────────────────────────
router.get("/history", authenticate, async (req: AuthRequest, res) => {
  try {
    const personnelId = req.query.personnelId ? parseInt(req.query.personnelId as string) : undefined;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 500) : 100;

    const query = personnelId
      ? db.select({
          id: paymentsTable.id,
          personnelId: paymentsTable.personnelId,
          personnelName: personnelTable.name,
          periodStart: paymentsTable.periodStart,
          periodEnd: paymentsTable.periodEnd,
          amount: paymentsTable.amount,
          paymentDate: paymentsTable.paymentDate,
          paymentMethod: paymentsTable.paymentMethod,
          reference: paymentsTable.reference,
          notes: paymentsTable.notes,
          paidBy: paymentsTable.paidBy,
          createdAt: paymentsTable.createdAt,
        })
        .from(paymentsTable)
        .innerJoin(personnelTable, eq(personnelTable.id, paymentsTable.personnelId))
        .where(eq(paymentsTable.personnelId, personnelId))
        .orderBy(desc(paymentsTable.paymentDate))
        .limit(limit)
      : db.select({
          id: paymentsTable.id,
          personnelId: paymentsTable.personnelId,
          personnelName: personnelTable.name,
          periodStart: paymentsTable.periodStart,
          periodEnd: paymentsTable.periodEnd,
          amount: paymentsTable.amount,
          paymentDate: paymentsTable.paymentDate,
          paymentMethod: paymentsTable.paymentMethod,
          reference: paymentsTable.reference,
          notes: paymentsTable.notes,
          paidBy: paymentsTable.paidBy,
          createdAt: paymentsTable.createdAt,
        })
        .from(paymentsTable)
        .innerJoin(personnelTable, eq(personnelTable.id, paymentsTable.personnelId))
        .orderBy(desc(paymentsTable.paymentDate))
        .limit(limit);

    const rows = await query;
    res.json(rows.map(r => ({ ...r, amount: parseFloat(r.amount as string) })));
  } catch (err) {
    req.log.error({ err }, "Payroll history error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /api/payroll/:id ──────────────────────────────────────────────
router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Accès refusé", message: "Seul l'administrateur peut annuler un paiement" });
      return;
    }
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(paymentsTable).where(eq(paymentsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Non trouvé" });
      return;
    }
    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CANCEL_PAYMENT",
      details: `Annulation du paiement #${id} (${deleted.amount} FCFA)`,
      entityType: "payment",
      entityId: id,
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Cancel payment error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
