import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, comparePassword, generateTokens, hashPassword, verifyRefreshToken, type AuthRequest } from "../lib/auth.js";
import { activityLogsTable } from "@workspace/db";
import { createNotification, notifyAdmins, broadcastRefresh } from "../lib/notifications.js";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
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

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Validation", message: "Email et mot de passe requis" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      res.status(401).json({ error: "Non autorisé", message: "Email ou mot de passe incorrect" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Non autorisé", message: "Compte désactivé" });
      return;
    }
    if (user.status === "PENDING") {
      res.status(403).json({ error: "En attente", message: "Votre compte est en cours de validation par l'administrateur." });
      return;
    }
    if (user.status === "REJECTED") {
      res.status(403).json({ error: "Rejeté", message: `Votre compte a été refusé${user.rejectionReason ? ` : ${user.rejectionReason}` : ""}.` });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Non autorisé", message: "Email ou mot de passe incorrect" });
      return;
    }

    const { token, refreshToken } = generateTokens({ userId: user.id, email: user.email, role: user.role });
    await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

    await db.insert(activityLogsTable).values({
      userId: user.id,
      action: "LOGIN",
      details: `Connexion de ${user.name}`,
      entityType: "user",
      entityId: user.id,
    });

    res.json({ token, refreshToken, user: formatUser(user) });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la connexion" });
  }
});

// Public registration — creates account with PENDING status
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body ?? {};
    if (!name || !email || !password) {
      res.status(400).json({ error: "Validation", message: "Nom, email et mot de passe requis" });
      return;
    }
    // Only OUVRIER and CHEF_CHANTIER can self-register
    const allowedRoles = ["OUVRIER", "CHEF_CHANTIER"];
    const finalRole = allowedRoles.includes(role) ? role : "OUVRIER";

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      res.status(400).json({ error: "Validation", message: "Un compte avec cet email existe déjà" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      phone: phone || null,
      passwordHash,
      role: finalRole as any,
      status: "PENDING",
      isActive: true,
    }).returning();

    await notifyAdmins(db, {
      type: "NEW_USER_PENDING",
      title: "Nouveau compte en attente",
      message: `${name} (${finalRole === "OUVRIER" ? "Ouvrier" : "Chef de Chantier"}) a demandé un accès`,
      relatedId: user.id,
      relatedType: "user",
    });

    broadcastRefresh("refresh:users");

    res.status(201).json({
      message: "Compte créé. En attente de validation par l'administrateur.",
      userId: user.id,
    });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de l'inscription" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "GetMe error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération du profil" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: "Validation", message: "Token de rafraîchissement requis" });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({ error: "Non autorisé", message: "Token de rafraîchissement invalide" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ error: "Non autorisé", message: "Token de rafraîchissement invalide" });
      return;
    }

    const tokens = generateTokens({ userId: user.id, email: user.email, role: user.role });
    await db.update(usersTable).set({ refreshToken: tokens.refreshToken }).where(eq(usersTable.id, user.id));

    res.json({ ...tokens, user: formatUser(user) });
  } catch (err) {
    req.log.error({ err }, "Refresh error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors du rafraîchissement" });
  }
});

export default router;
