import { Router } from "express";
import { db } from "@workspace/db";
import { presenceConfirmationsTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const date = req.query.date as string | undefined;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const role = req.user!.role;

    let confirmations;
    if (role === "ADMIN" || role === "CHEF_CHANTIER") {
      confirmations = await db.select().from(presenceConfirmationsTable).orderBy(presenceConfirmationsTable.date);
    } else {
      confirmations = await db.select().from(presenceConfirmationsTable)
        .where(eq(presenceConfirmationsTable.workerId, req.user!.userId))
        .orderBy(presenceConfirmationsTable.date);
    }

    if (date) confirmations = confirmations.filter(c => c.date === date);
    if (projectId) confirmations = confirmations.filter(c => c.projectId === projectId);

    const result = await Promise.all(confirmations.map(async (c) => {
      const [worker] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.workerId)).limit(1);
      return { ...c, workerName: worker?.name };
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List presence confirmations error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des confirmations" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { date, projectId, status } = req.body ?? {};
    if (!date || !status) {
      res.status(400).json({ error: "Validation", message: "Date et statut requis" });
      return;
    }

    // Upsert — delete existing for this worker+date then insert
    await db.delete(presenceConfirmationsTable)
      .where(and(
        eq(presenceConfirmationsTable.workerId, req.user!.userId),
        eq(presenceConfirmationsTable.date, date)
      ));

    const [confirmation] = await db.insert(presenceConfirmationsTable).values({
      workerId: req.user!.userId,
      projectId: projectId ? parseInt(projectId) : null,
      date,
      status,
    }).returning();

    const [worker] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    res.status(201).json({ ...confirmation, workerName: worker?.name });
  } catch (err) {
    req.log.error({ err }, "Create presence confirmation error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la confirmation" });
  }
});

export default router;
