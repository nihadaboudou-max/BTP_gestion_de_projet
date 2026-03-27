import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, comparePassword, generateTokens, hashPassword, verifyRefreshToken, type AuthRequest } from "../lib/auth.js";
import { activityLogsTable } from "@workspace/db";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
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

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la connexion" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Non trouvé", message: "Utilisateur non trouvé" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
    });
  } catch (err) {
    req.log.error({ err }, "GetMe error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération du profil" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
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

    res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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
      },
    });
  } catch (err) {
    req.log.error({ err }, "Refresh error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors du rafraîchissement" });
  }
});

export default router;
