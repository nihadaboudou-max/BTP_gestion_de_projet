import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const notifications = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.userId))
      .orderBy(notificationsTable.createdAt);
    res.json(notifications.reverse());
  } catch (err) {
    req.log.error({ err }, "List notifications error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des notifications" });
  }
});

router.post("/:id/read", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id));
    res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (err) {
    req.log.error({ err }, "Mark notification read error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur" });
  }
});

router.post("/read-all", authenticate, async (req: AuthRequest, res) => {
  try {
    await db.update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, req.user!.userId));
    res.json({ success: true, message: "Toutes les notifications marquées comme lues" });
  } catch (err) {
    req.log.error({ err }, "Mark all notifications read error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur" });
  }
});

export default router;
