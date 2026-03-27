import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, usersTable, projectsTable, activityLogsTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

async function formatMessage(m: typeof messagesTable.$inferSelect) {
  let senderName: string = "Inconnu";
  const [s] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, m.senderId)).limit(1);
  senderName = s?.name || "Inconnu";

  let recipientName: string | undefined;
  if (m.recipientId) {
    const [r] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, m.recipientId)).limit(1);
    recipientName = r?.name;
  }

  let projectName: string | undefined;
  if (m.projectId) {
    const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, m.projectId)).limit(1);
    projectName = p?.name;
  }

  return { ...m, senderName, recipientName, projectName };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { userId, role } = req.user!;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const recipientId = req.query.recipientId ? parseInt(req.query.recipientId as string) : undefined;

    let messages;
    if (role === "ADMIN") {
      messages = projectId
        ? await db.select().from(messagesTable).where(eq(messagesTable.projectId, projectId)).orderBy(messagesTable.createdAt)
        : await db.select().from(messagesTable).orderBy(messagesTable.createdAt);
    } else {
      messages = await db.select().from(messagesTable)
        .where(or(eq(messagesTable.senderId, userId), eq(messagesTable.recipientId, userId)))
        .orderBy(messagesTable.createdAt);
    }

    const result = await Promise.all(messages.map(formatMessage));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List messages error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des messages" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.user!;
    const body = req.body ?? {};
    const { recipientId, projectId } = body;
    const content = body.content || body.body || body.message || "";
    const subject = body.subject || "";
    const fullContent = subject ? `[${subject}] ${content}` : content;

    if (!fullContent.trim()) {
      res.status(400).json({ error: "Validation", message: "Contenu du message requis" });
      return;
    }

    const [message] = await db.insert(messagesTable).values({
      senderId: userId,
      recipientId: recipientId ? parseInt(recipientId) : null,
      projectId: projectId ? parseInt(projectId) : null,
      content: fullContent,
    }).returning();

    if (recipientId) {
      await createNotification({
        userId: parseInt(recipientId),
        type: "MESSAGE_RECEIVED",
        title: "Nouveau message",
        message: `Vous avez reçu un nouveau message`,
        relatedId: message.id,
        relatedType: "message",
      });
    }

    const formatted = await formatMessage(message);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Send message error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'envoi du message" });
  }
});

router.post("/:id/read", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(messagesTable).set({ isRead: true }).where(eq(messagesTable.id, id));
    res.json({ success: true, message: "Message marqué comme lu" });
  } catch (err) {
    req.log.error({ err }, "Mark message read error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur" });
  }
});

export default router;
