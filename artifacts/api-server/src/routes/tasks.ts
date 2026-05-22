import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, usersTable, projectsTable, personnelTable, activityLogsTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification, notifyAdmins, broadcastRefresh } from "../lib/notifications.js";

const router = Router();

function nullDate(val: any) {
  return (val === "" || val === null || val === undefined) ? null : val;
}

async function formatTask(task: typeof tasksTable.$inferSelect) {
  let assignedToName: string | undefined;
  if (task.assignedToId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedToId)).limit(1);
    assignedToName = u?.name;
  }
  let assignedPersonnelName: string | undefined;
  let assignedPersonnelTrade: string | undefined;
  let assignedPersonnelIsPrestataire: boolean = false;
  if ((task as any).assignedPersonnelId) {
    const [p] = await db.select({
      name: personnelTable.name,
      trade: personnelTable.trade,
      isPrestataire: personnelTable.isPrestataire,
    }).from(personnelTable).where(eq(personnelTable.id, (task as any).assignedPersonnelId)).limit(1);
    assignedPersonnelName = p?.name;
    assignedPersonnelTrade = p?.trade;
    assignedPersonnelIsPrestataire = !!p?.isPrestataire;
  }
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, task.projectId)).limit(1);
  return {
    ...task,
    assignedToName,
    assignedPersonnelName,
    assignedPersonnelTrade,
    assignedPersonnelIsPrestataire,
    projectName: p?.name,
  };
}

/**
 * GET /api/tasks/assignable-personnel
 * Liste tous les ouvriers + prestataires affectables à une tâche.
 * Inclut un flag isPrestataire pour différencier dans le dropdown.
 */
router.get("/assignable-personnel", authenticate, async (req: AuthRequest, res) => {
  try {
    const list = await db.select({
      id: personnelTable.id,
      name: personnelTable.name,
      trade: personnelTable.trade,
      phone: personnelTable.phone,
      isPrestataire: personnelTable.isPrestataire,
      dailyWage: personnelTable.dailyWage,
    }).from(personnelTable)
      .where(and(eq(personnelTable.isActive, true), eq(personnelTable.archived, false)));
    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Get assignable personnel error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const role = req.user!.role;
    const userId = req.user!.userId;

    let tasks;
    if (role === "ADMIN") {
      tasks = projectId
        ? await db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId))
        : await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
    } else if (role === "CHEF_CHANTIER") {
      // Chef sees all tasks (all projects are theirs to manage)
      tasks = projectId
        ? await db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId))
        : await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
    } else {
      // Ouvrier sees only tasks assigned to them
      tasks = projectId
        ? await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.assignedToId, userId)))
        : await db.select().from(tasksTable).where(eq(tasksTable.assignedToId, userId)).orderBy(tasksTable.createdAt);
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
    const body = req.body ?? {};
    const { projectId, title, description, priority, status } = body;
    // Accept both assignedToId and assignedTo
    const assignedToId = body.assignedToId ?? body.assignedTo ?? null;

    if (!projectId || !title || !priority) {
      res.status(400).json({ error: "Validation", message: "Projet, titre et priorité requis" });
      return;
    }

    const [task] = await db.insert(tasksTable).values({
      projectId: parseInt(projectId),
      title,
      description: description || null,
      assignedToId: assignedToId ? parseInt(assignedToId) : null,
      assignedPersonnelId: body.assignedPersonnelId ? parseInt(body.assignedPersonnelId) : null,
      taskAmount: body.taskAmount != null ? body.taskAmount.toString() : null,
      progressPct: body.progressPct != null ? parseInt(body.progressPct) : 0,
      dueDate: nullDate(body.dueDate),
      priority: priority || "NORMALE",
      status: status || "A_FAIRE",
    } as any).returning();

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_TASK",
      details: `Création de la tâche "${title}"`,
      entityType: "task",
      entityId: task.id,
    });

    if (assignedToId) {
      const assignedId = parseInt(assignedToId);
      await createNotification({
        userId: assignedId,
        type: "TASK_ASSIGNED",
        title: "Nouvelle tâche assignée",
        message: `La tâche "${title}" vous a été assignée — veuillez confirmer sa réception`,
        relatedId: task.id,
        relatedType: "task",
      });
    }

    // Notify admins about new task
    await notifyAdmins(db, {
      type: "TASK_CREATED",
      title: "Nouvelle tâche créée",
      message: `La tâche "${title}" a été créée`,
      relatedId: task.id,
      relatedType: "task",
    });

    broadcastRefresh("refresh:tasks");

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
    const body = req.body ?? {};
    const { title, description, priority, status } = body;
    const assignedToId = body.assignedToId ?? body.assignedTo;

    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId ? parseInt(assignedToId) : null;
    if (body.assignedPersonnelId !== undefined) updates.assignedPersonnelId = body.assignedPersonnelId ? parseInt(body.assignedPersonnelId) : null;
    if (body.taskAmount !== undefined) updates.taskAmount = body.taskAmount != null ? body.taskAmount.toString() : null;
    if (body.progressPct !== undefined) updates.progressPct = parseInt(body.progressPct);
    if (body.dueDate !== undefined) updates.dueDate = nullDate(body.dueDate);
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      if (status === "TERMINEE" && existing.status !== "TERMINEE") {
        updates.completedAt = new Date();
      }
    }

    const wasAssigned = existing.assignedToId;
    const newAssignee = updates.assignedToId;
    const reassigned = newAssignee && newAssignee !== wasAssigned;

    const [task] = await db.update(tasksTable).set({ ...updates, updatedAt: new Date() }).where(eq(tasksTable.id, id)).returning();

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "UPDATE_TASK",
      details: `Mise à jour de la tâche "${task.title}"`,
      entityType: "task",
      entityId: id,
    });

    // Notify newly assigned user
    if (reassigned) {
      await createNotification({
        userId: newAssignee!,
        type: "TASK_ASSIGNED",
        title: "Tâche assignée",
        message: `La tâche "${task.title}" vous a été assignée — veuillez confirmer sa réception`,
        relatedId: task.id,
        relatedType: "task",
      });
    }

    // Notify admins when status changes
    if (status && status !== existing.status) {
      await notifyAdmins(db, {
        type: "TASK_STATUS_CHANGED",
        title: "Avancement d'une tâche",
        message: `La tâche "${task.title}" est passée à "${status}"`,
        relatedId: task.id,
        relatedType: "task",
      });
    }

    broadcastRefresh("refresh:tasks");

    const formatted = await formatTask(task);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de la tâche" });
  }
});

// Ouvrier confirms receiving/accepting a task
router.post("/:id/confirm", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user!.userId;

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!task) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }

    // Only the assigned user or an admin can confirm
    if (req.user!.role !== "ADMIN" && task.assignedToId !== userId) {
      res.status(403).json({ error: "Accès refusé", message: "Vous n'êtes pas assigné à cette tâche" });
      return;
    }

    const [updated] = await db.update(tasksTable)
      .set({ confirmedAt: new Date(), status: "EN_COURS", updatedAt: new Date() })
      .where(eq(tasksTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      userId,
      action: "CONFIRM_TASK",
      details: `Confirmation de la tâche "${task.title}"`,
      entityType: "task",
      entityId: id,
    });

    // Notify admins and chef that task was confirmed
    await notifyAdmins(db, {
      type: "TASK_CONFIRMED",
      title: "Tâche confirmée",
      message: `La tâche "${task.title}" a été confirmée et est en cours`,
      relatedId: task.id,
      relatedType: "task",
    });

    broadcastRefresh("refresh:tasks");

    const formatted = await formatTask(updated);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Confirm task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la confirmation de la tâche" });
  }
});

/**
 * POST /api/tasks/:id/uncomplete
 * Réouvre une tâche marquée TERMINEE par erreur. Repasse en EN_COURS.
 * Accessible aux ADMIN, CHEF_CHANTIER ou à l'assigné de la tâche.
 */
router.post("/:id/uncomplete", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user!.userId;
    const role = req.user!.role;

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!task) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }
    if (task.status !== "TERMINEE") {
      res.status(400).json({ error: "Validation", message: "Cette tâche n'est pas marquée comme terminée" });
      return;
    }
    if (role !== "ADMIN" && role !== "CHEF_CHANTIER" && task.assignedToId !== userId) {
      res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante" });
      return;
    }

    const [updated] = await db.update(tasksTable)
      .set({ status: "EN_COURS", completedAt: null, updatedAt: new Date() } as any)
      .where(eq(tasksTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      userId,
      action: "UNCOMPLETE_TASK",
      details: `Annulation du statut TERMINEE pour la tâche "${task.title}"`,
      entityType: "task",
      entityId: id,
    });

    broadcastRefresh("refresh:tasks");
    const formatted = await formatTask(updated);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Uncomplete task error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role;
    if (role !== "ADMIN" && role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante" });
      return;
    }
    const id = parseInt(req.params.id);
    const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, id)).returning();
    if (!task) {
      res.status(404).json({ error: "Non trouvé", message: "Tâche non trouvée" });
      return;
    }
    broadcastRefresh("refresh:tasks");
    res.json({ success: true, message: "Tâche supprimée" });
  } catch (err) {
    req.log.error({ err }, "Delete task error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression de la tâche" });
  }
});

export default router;
