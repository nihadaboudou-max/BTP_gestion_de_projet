import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, usersTable, projectsTable, activityLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../lib/auth.js";
import { createNotification, notifyAdmins } from "../lib/notifications.js";

const router = Router();

async function formatExpense(e: typeof expensesTable.$inferSelect) {
  let projectName: string | undefined;
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, e.projectId)).limit(1);
  projectName = p?.name;

  let addedByName: string | undefined;
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, e.addedById)).limit(1);
  addedByName = u?.name;

  return { ...e, projectName, addedByName, amount: parseFloat(e.amount as string) };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;

    let expenses;
    if (req.user!.role === "ADMIN") {
      expenses = await db.select().from(expensesTable).orderBy(expensesTable.date);
    } else {
      expenses = await db.select().from(expensesTable).where(eq(expensesTable.addedById, req.user!.userId)).orderBy(expensesTable.date);
    }

    if (projectId) expenses = expenses.filter(e => e.projectId === projectId);
    if (category) expenses = expenses.filter(e => e.category === category);
    if (status) expenses = expenses.filter(e => e.status === status);

    const result = await Promise.all(expenses.map(formatExpense));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List expenses error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des dépenses" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { role: userRole, userId } = req.user!;
    if (userRole !== "ADMIN") {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u?.canAddExpenses) {
        res.status(403).json({ error: "Accès refusé", message: "Permission insuffisante pour ajouter une dépense" });
        return;
      }
    }

    const { projectId, title, category, amount, date, supplier, receiptUrl } = req.body;
    if (!projectId || !title || !category || !amount || !date) {
      res.status(400).json({ error: "Validation", message: "Projet, titre, catégorie, montant et date requis" });
      return;
    }

    const [expense] = await db.insert(expensesTable).values({
      projectId: parseInt(projectId),
      title, category,
      amount: amount.toString(),
      date, supplier, receiptUrl,
      addedById: userId,
      status: "EN_ATTENTE",
    }).returning();

    await db.insert(activityLogsTable).values({
      userId,
      action: "CREATE_EXPENSE",
      details: `Ajout d'une dépense "${title}" - ${amount} FCFA`,
      entityType: "expense",
      entityId: expense.id,
    });

    await notifyAdmins(db, {
      type: "NEW_EXPENSE",
      title: "Nouvelle dépense en attente",
      message: `Nouvelle dépense "${title}" de ${amount} FCFA en attente de validation`,
      relatedId: expense.id,
      relatedType: "expense",
    });

    const formatted = await formatExpense(expense);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create expense error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création de la dépense" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, category, amount, date, supplier } = req.body;

    const updates: Partial<typeof expensesTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (amount !== undefined) updates.amount = amount.toString();
    if (date !== undefined) updates.date = date;
    if (supplier !== undefined) updates.supplier = supplier;

    const [expense] = await db.update(expensesTable).set({ ...updates, updatedAt: new Date() }).where(eq(expensesTable.id, id)).returning();
    if (!expense) {
      res.status(404).json({ error: "Non trouvé", message: "Dépense non trouvée" });
      return;
    }
    const formatted = await formatExpense(expense);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update expense error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de la dépense" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
    if (!expense) {
      res.status(404).json({ error: "Non trouvé", message: "Dépense non trouvée" });
      return;
    }
    res.json({ success: true, message: "Dépense supprimée" });
  } catch (err) {
    req.log.error({ err }, "Delete expense error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression de la dépense" });
  }
});

router.post("/:id/validate", authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Accès refusé", message: "Seul l'administrateur peut valider les dépenses" });
      return;
    }

    const id = parseInt(req.params.id);
    const { approved, comment } = req.body;

    const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Non trouvé", message: "Dépense non trouvée" });
      return;
    }

    const [expense] = await db.update(expensesTable)
      .set({ status: approved ? "APPROUVEE" : "REJETEE", adminComment: comment, updatedAt: new Date() })
      .where(eq(expensesTable.id, id))
      .returning();

    await createNotification({
      userId: existing.addedById,
      type: approved ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
      title: approved ? "Dépense approuvée" : "Dépense rejetée",
      message: approved ? `Votre dépense "${existing.title}" a été approuvée` : `Votre dépense "${existing.title}" a été rejetée${comment ? `: ${comment}` : ""}`,
      relatedId: id,
      relatedType: "expense",
    });

    const formatted = await formatExpense(expense);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Validate expense error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la validation de la dépense" });
  }
});

export default router;
