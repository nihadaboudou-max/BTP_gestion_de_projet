import { Router } from "express";
import { db } from "@workspace/db";
import { reclamationsTable, usersTable, pointageSheetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification, notifyAdmins } from "../lib/notifications.js";

const router = Router();

async function formatReclamation(r: typeof reclamationsTable.$inferSelect) {
  const [worker] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, r.workerId)).limit(1);
  let sheetDate: string | undefined;
  if (r.sheetId) {
    const [sheet] = await db.select({ date: pointageSheetsTable.date }).from(pointageSheetsTable).where(eq(pointageSheetsTable.id, r.sheetId)).limit(1);
    sheetDate = sheet?.date;
  }
  return { ...r, workerName: worker?.name, sheetDate };
}

const typeLabels: Record<string, string> = {
  ERREUR_SALAIRE: "Erreur de salaire",
  ERREUR_PRESENCE: "Erreur de présence",
  AUTRE: "Autre",
};

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role;
    let reclamations;
    if (role === "ADMIN" || role === "CHEF_CHANTIER") {
      reclamations = await db.select().from(reclamationsTable).orderBy(reclamationsTable.createdAt);
    } else {
      reclamations = await db.select().from(reclamationsTable).where(eq(reclamationsTable.workerId, req.user!.userId)).orderBy(reclamationsTable.createdAt);
    }
    const result = await Promise.all(reclamations.map(formatReclamation));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List reclamations error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des réclamations" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { sheetId, type, description } = req.body ?? {};
    if (!type || !description) {
      res.status(400).json({ error: "Validation", message: "Type et description requis" });
      return;
    }

    const [reclamation] = await db.insert(reclamationsTable).values({
      workerId: req.user!.userId,
      sheetId: sheetId ? parseInt(sheetId) : null,
      type,
      description,
      status: "EN_ATTENTE",
    }).returning();

    await notifyAdmins(db, {
      type: "NEW_RECLAMATION",
      title: "Nouvelle réclamation",
      message: `${typeLabels[type] || type} — ${description.substring(0, 80)}`,
      relatedId: reclamation.id,
      relatedType: "reclamation",
    });

    const formatted = await formatReclamation(reclamation);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create reclamation error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création de la réclamation" });
  }
});

router.put("/:id/respond", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante" });
      return;
    }
    const id = parseInt(req.params.id);
    const { response, status } = req.body ?? {};

    const [existing] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Réclamation non trouvée" });
      return;
    }

    const newStatus = status === "TRAITEE" ? "TRAITEE" : status === "REJETEE" ? "REJETEE" : "EN_ATTENTE";
    const [updated] = await db.update(reclamationsTable).set({
      adminResponse: response,
      status: newStatus,
      resolvedAt: newStatus !== "EN_ATTENTE" ? new Date() : null,
    }).where(eq(reclamationsTable.id, id)).returning();

    await createNotification({
      userId: existing.workerId,
      type: "RECLAMATION_RESPONSE",
      title: `Réclamation ${newStatus === "TRAITEE" ? "traitée" : newStatus === "REJETEE" ? "rejetée" : "mise à jour"}`,
      message: response || "Votre réclamation a été mise à jour",
      relatedId: id,
      relatedType: "reclamation",
    });

    const formatted = await formatReclamation(updated);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Respond reclamation error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la réponse" });
  }
});

export default router;
