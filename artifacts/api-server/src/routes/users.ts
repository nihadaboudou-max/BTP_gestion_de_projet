import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, activityLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin, hashPassword, type AuthRequest } from "../lib/auth.js";
import { createNotification, broadcastRefresh } from "../lib/notifications.js";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    rejectionReason: user.rejectionReason,
    isActive: user.isActive,
    permissions: {
      canAddWorkers: user.canAddWorkers,
      canDeleteWorkers: user.canDeleteWorkers,
      canEditWorkers: user.canEditWorkers,
      canAddExpenses: user.canAddExpenses,
      canDeleteExpenses: user.canDeleteExpenses,
      canAddProjects: user.canAddProjects,
      canViewFinances: user.canViewFinances,
      canManagePointage: user.canManagePointage,
    },
    createdAt: user.createdAt,
  };
}

router.get("/", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.name);
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des utilisateurs" });
  }
});

// GET /users/pending — admin only: accounts awaiting approval
router.get("/pending", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await db.select().from(usersTable)
      .where(eq(usersTable.status, "PENDING"))
      .orderBy(usersTable.createdAt);
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List pending users error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur" });
  }
});

// POST /users/:id/approve — admin approves account with optional permissions
router.post("/:id/approve", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions, role } = req.body ?? {};

    const perms: Partial<typeof usersTable.$inferInsert> = {};
    if (permissions) {
      if (permissions.canAddWorkers !== undefined) perms.canAddWorkers = permissions.canAddWorkers;
      if (permissions.canDeleteWorkers !== undefined) perms.canDeleteWorkers = permissions.canDeleteWorkers;
      if (permissions.canEditWorkers !== undefined) perms.canEditWorkers = permissions.canEditWorkers;
      if (permissions.canAddExpenses !== undefined) perms.canAddExpenses = permissions.canAddExpenses;
      if (permissions.canDeleteExpenses !== undefined) perms.canDeleteExpenses = permissions.canDeleteExpenses;
      if (permissions.canAddProjects !== undefined) perms.canAddProjects = permissions.canAddProjects;
      if (permissions.canViewFinances !== undefined) perms.canViewFinances = permissions.canViewFinances;
      if (permissions.canManagePointage !== undefined) perms.canManagePointage = permissions.canManagePointage;
    }
    if (role) perms.role = role;

    const [user] = await db.update(usersTable).set({
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: String(req.user!.userId),
      isActive: true,
      updatedAt: new Date(),
      ...perms,
    }).where(eq(usersTable.id, id)).returning();

    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }

    await createNotification({
      userId: id,
      type: "ACCOUNT_APPROVED",
      title: "Compte approuvé",
      message: "Votre compte a été approuvé. Vous pouvez maintenant vous connecter.",
      relatedId: id,
      relatedType: "user",
    });

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "APPROVE_USER",
      details: `Compte approuvé : ${user.name}`,
      entityType: "user",
      entityId: id,
    });

    broadcastRefresh("refresh:users");

    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Approve user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'approbation" });
  }
});

// POST /users/:id/reject — admin rejects account with reason
router.post("/:id/reject", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body ?? {};

    const [user] = await db.update(usersTable).set({
      status: "REJECTED",
      rejectionReason: reason || null,
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, id)).returning();

    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "REJECT_USER",
      details: `Compte rejeté : ${user.name}${reason ? ` — ${reason}` : ""}`,
      entityType: "user",
      entityId: id,
    });

    broadcastRefresh("refresh:users");

    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Reject user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors du rejet" });
  }
});

router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { email, name, password, role, permissions } = req.body ?? {};
    if (!email || !name || !password || !role) {
      res.status(400).json({ error: "Validation", message: "Email, nom, mot de passe et rôle requis" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "Validation", message: "Cet email est déjà utilisé" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email,
      name,
      passwordHash,
      role,
      status: "APPROVED",
      ...(permissions || {}),
    }).returning();

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "CREATE_USER",
      details: `Création de l'utilisateur ${name}`,
      entityType: "user",
      entityId: user.id,
    });

    res.status(201).json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la création de l'utilisateur" });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Get user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération de l'utilisateur" });
  }
});

router.put("/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, role, isActive, permissions, password } = req.body ?? {};

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await hashPassword(password);
    if (permissions) {
      if (permissions.canAddWorkers !== undefined) updates.canAddWorkers = permissions.canAddWorkers;
      if (permissions.canDeleteWorkers !== undefined) updates.canDeleteWorkers = permissions.canDeleteWorkers;
      if (permissions.canEditWorkers !== undefined) updates.canEditWorkers = permissions.canEditWorkers;
      if (permissions.canAddExpenses !== undefined) updates.canAddExpenses = permissions.canAddExpenses;
      if (permissions.canDeleteExpenses !== undefined) updates.canDeleteExpenses = permissions.canDeleteExpenses;
      if (permissions.canAddProjects !== undefined) updates.canAddProjects = permissions.canAddProjects;
      if (permissions.canViewFinances !== undefined) updates.canViewFinances = permissions.canViewFinances;
      if (permissions.canManagePointage !== undefined) updates.canManagePointage = permissions.canManagePointage;
    }

    const [user] = await db.update(usersTable).set({ ...updates, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }

    await db.insert(activityLogsTable).values({
      userId: req.user!.userId,
      action: "UPDATE_USER",
      details: `Mise à jour de l'utilisateur ${user.name}`,
      entityType: "user",
      entityId: id,
    });

    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Update user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la mise à jour de l'utilisateur" });
  }
});

router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }
    res.json({ success: true, message: "Utilisateur supprimé" });
  } catch (err) {
    req.log.error({ err }, "Delete user error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la suppression de l'utilisateur" });
  }
});

export default router;
