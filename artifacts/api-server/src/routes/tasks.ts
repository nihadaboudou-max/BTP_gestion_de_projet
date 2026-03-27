import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, usersTable, projectsTable, activityLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

async function formatTask(task: typeof tasksTable.$inferSelect) {
  let assignedToName: string | undefined;
  if (task.assignedToId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedToId)).limit(1);
    assignedToName = u?.name;
  }
  let projectName: string | undefined;
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, task.projectId)).limit(1);
  projectName = p?.name;
  return { ...task, assignedToName, projectName };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    let query = db.select().from(tasksTable);

    let tasks;
    if (req.user!.role === "ADMIN") {
      tasks = projectId
        ? await db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId))
        : await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
    } else {
      tasks = projectId
        ? await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.assignedToId, req.user!.userId)))
        : await db.select().from(tasksTable).where(eq(tasksTable.assignedToId, req.user!.userId)).orderBy(tasksTable.createdAt);
    }

    const result = await Promise.all(tasks.map(formatTask));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List tasks error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des tâches" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { projectId, title, description, assignedToId, dueDate, priority, status } = req.body ?? {};
    if (!projectId || !title || !priority) {
      res.status(400).json({ error: "Validation", message: "Projet, titre et priorité requis" });
      return;
    }

    const [task] = await db.insert(tasksTable).values({
      projectId: parseInt(projectId),
      title, description,
      assignedToId: assignedToId ? parseInt(assignedToId) : null,
      dueDate, priority: priority || "NORMALE",
      status: status || "A_FAIRE",
    }).returning();

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_TASK",
      details: `Création de la tâche "${title}"`,
      entityType: "task",
      entityId: task.id,
    });

    if (assignedToId) {
      await createNotification({
        userId: parseInt(assignedToId),
        type: "TASK_ASSIGNED",
        title: "Nouvelle tâche assignée",
        message: `La tâche "${title}" vous a été assignée`,
        relatedId: task.id,
        relatedType: "task",
      });
    }

    const formatted = await formatTask(task);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création de la tâche" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, assignedToId, dueDate, priority, status } = req.body ?? {};

    const updates: Partial<typeof tasksTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;

    const [task] = await db.update(tasksTable).set({ ...updates, updatedAt: new Date() }).where(eq(tasksTable.id, id)).returning();
    if (!task) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "UPDATE_TASK",
      details: `Mise à jour de la tâche "${task.title}"`,
      entityType: "task",
      entityId: id,
    });

    const formatted = await formatTask(task);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de la tâche" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, id)).returning();
    if (!task) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }
    res.json({ success: true, message: "Tâche supprimée" });
  } catch (err) {
    req.log.error({ err }, "Delete task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression de la tâche" });
  }
});

export default router;
