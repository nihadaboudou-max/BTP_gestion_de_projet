import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, usersTable, activityLogsTable, expensesTable, tasksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { notifyAdmins, broadcastRefresh } from "../lib/notifications.js";

const router = Router();

function nullDate(val: any) {
  return (val === "" || val === null || val === undefined) ? null : val;
}

async function getProjectWithBudget(id: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
  if (!project) return null;

  const expenseResult = await db
    .select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
    .from(expensesTable)
    .where(eq(expensesTable.projectId, id));

  const budgetSpent = parseFloat(expenseResult[0]?.total || "0");
  await db.update(projectsTable).set({ budgetSpent: budgetSpent.toString() }).where(eq(projectsTable.id, id));

  let chefName: string | undefined;
  if (project.chefId) {
    const [chef] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, project.chefId)).limit(1);
    chefName = chef?.name;
  }

  return { ...project, budgetSpent: budgetSpent, chefName };
}

function formatProject(p: any) {
  return {
    ...p,
    budgetTotal: parseFloat(p.budgetTotal as string),
    budgetSpent: parseFloat(p.budgetSpent as string || "0"),
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    // ADMIN and CHEF_CHANTIER see all projects; OUVRIER sees assigned projects only
    const role = req.user!.role;
    let projects;
    if (role === "ADMIN" || role === "CHEF_CHANTIER") {
      projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
    } else {
      projects = await db.select().from(projectsTable).where(eq(projectsTable.chefId, req.user!.userId)).orderBy(projectsTable.createdAt);
    }

    const result = await Promise.all(projects.map(async (p) => {
      let chefName: string | undefined;
      if (p.chefId) {
        const [chef] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, p.chefId)).limit(1);
        chefName = chef?.name;
      }
      return { ...formatProject(p), chefName };
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List projects error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des projets" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    if (user.role !== "ADMIN" && user.role !== "CHEF_CHANTIER") {
      res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante pour créer un projet" });
      return;
    }
    if (user.role === "CHEF_CHANTIER") {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId)).limit(1);
      if (!u?.canAddProjects) {
        res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante pour créer un projet" });
        return;
      }
    }

    const { name, location, clientName, status, budgetTotal, progress, startDate, endDate, chefId } = req.body ?? {};
    if (!name || budgetTotal === undefined || budgetTotal === null || budgetTotal === "") {
      res.status(400).json({ error: "Validation", message: "Nom et budget requis" });
      return;
    }

    const [project] = await db.insert(projectsTable).values({
      name,
      location: location || null,
      clientName: clientName || null,
      status: status || "PLANIFIE",
      budgetTotal: budgetTotal.toString(),
      progress: progress || 0,
      startDate: nullDate(startDate),
      endDate: nullDate(endDate),
      chefId: chefId ? parseInt(chefId) : null,
    }).returning();

    await db.insert(activityLogsTable).values({
      userId: user.userId,
      action: "CREATE_PROJECT",
      details: `Création du projet "${name}"`,
      entityType: "project",
      entityId: project.id,
    });

    await notifyAdmins(db, {
      type: "NEW_PROJECT",
      title: "Nouveau projet créé",
      message: `Le projet "${name}" a été créé`,
      relatedId: project.id,
      relatedType: "project",
    });

    broadcastRefresh("refresh:projects");

    res.status(201).json({ ...formatProject(project) });
  } catch (err) {
    req.log.error({ err }, "Create project error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création du projet" });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const project = await getProjectWithBudget(id);
    if (!project) {
      res.status(404).json({ error: "Non trouvé", message: "Projet non trouvé" });
      return;
    }
    res.json({ ...formatProject(project) });
  } catch (err) {
    req.log.error({ err }, "Get project error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération du projet" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, location, clientName, status, budgetTotal, progress, startDate, endDate, chefId } = req.body ?? {};

    const updates: Partial<typeof projectsTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (location !== undefined) updates.location = location;
    if (clientName !== undefined) updates.clientName = clientName;
    if (status !== undefined) updates.status = status;
    if (budgetTotal !== undefined) updates.budgetTotal = budgetTotal.toString();
    if (progress !== undefined) updates.progress = progress;
    if (startDate !== undefined) updates.startDate = nullDate(startDate);
    if (endDate !== undefined) updates.endDate = nullDate(endDate);
    if (chefId !== undefined) updates.chefId = chefId ? parseInt(chefId) : null;

    const [project] = await db.update(projectsTable).set({ ...updates, updatedAt: new Date() }).where(eq(projectsTable.id, id)).returning();
    if (!project) {
      res.status(404).json({ error: "Non trouvé", message: "Projet non trouvé" });
      return;
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "UPDATE_PROJECT",
      details: `Mise à jour du projet "${project.name}"`,
      entityType: "project",
      entityId: id,
    });

    broadcastRefresh("refresh:projects");

    res.json({ ...formatProject(project) });
  } catch (err) {
    req.log.error({ err }, "Update project error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour du projet" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Accès refusé", message: "Seul l'administrateur peut supprimer un projet" });
      return;
    }
    const id = parseInt(req.params.id);
    const [project] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
    if (!project) {
      res.status(404).json({ error: "Non trouvé", message: "Projet non trouvé" });
      return;
    }
    broadcastRefresh("refresh:projects");
    res.json({ success: true, message: "Projet supprimé" });
  } catch (err) {
    req.log.error({ err }, "Delete project error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression du projet" });
  }
});

// GET /:id/tasks — list tasks for a project (for PAR_TACHE pay mode)
router.get("/:id/tasks", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const tasks = await db
      .select({ id: tasksTable.id, title: tasksTable.title, status: tasksTable.status })
      .from(tasksTable)
      .where(eq(tasksTable.projectId, id));
    res.json(tasks);
  } catch (err) {
    req.log.error({ err }, "Get project tasks error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
