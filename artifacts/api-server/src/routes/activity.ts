import { Router } from "express";
import { db } from "@workspace/db";
import { activityLogsTable, usersTable, expensesTable, projectsTable, personnelTable, pointageSheetsTable, messagesTable, notificationsTable } from "@workspace/db";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { authenticate, requireAdmin, type AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const logs = await db.select().from(activityLogsTable).orderBy(desc(activityLogsTable.createdAt)).limit(100);
    const result = await Promise.all(logs.map(async (log) => {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, log.userId)).limit(1);
      return { ...log, userName: u?.name || "Inconnu" };
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List activity error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des journaux" });
  }
});

router.get("/dashboard/stats", authenticate, async (req: AuthRequest, res) => {
  try {
    const { userId, role } = req.user!;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split("T")[0];

    const [projectsCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(projectsTable);
    const [activeCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(projectsTable).where(eq(projectsTable.status, "EN_COURS"));
    const [workersCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(personnelTable).where(eq(personnelTable.isActive, true));
    const [monthlyExp] = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` }).from(expensesTable).where(gte(expensesTable.date, startOfMonthStr));
    const [pendingExpenses] = await db.select({ count: sql<number>`COUNT(*)` }).from(expensesTable).where(eq(expensesTable.status, "EN_ATTENTE"));
    const [pendingPointage] = await db.select({ count: sql<number>`COUNT(*)` }).from(pointageSheetsTable).where(eq(pointageSheetsTable.status, "SOUMISE"));
    const [unreadMessages] = await db.select({ count: sql<number>`COUNT(*)` }).from(messagesTable).where(and(eq(messagesTable.isRead, false), eq(messagesTable.recipientId, userId)));

    const projects = await db.select().from(projectsTable);
    let budgetOverruns = 0;
    for (const p of projects) {
      const spent = parseFloat(p.budgetSpent as string);
      const total = parseFloat(p.budgetTotal as string);
      if (total > 0 && spent / total > 0.9) budgetOverruns++;
    }

    res.json({
      totalProjects: Number(projectsCount?.count || 0),
      activeProjects: Number(activeCount?.count || 0),
      totalWorkers: Number(workersCount?.count || 0),
      monthlyExpenses: parseFloat(monthlyExp?.total || "0"),
      pendingExpenses: Number(pendingExpenses?.count || 0),
      pendingPointage: Number(pendingPointage?.count || 0),
      unreadMessages: Number(unreadMessages?.count || 0),
      budgetOverruns,
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard stats error");
    res.status(500).json({ error: "Erreur serveur", message: "Erreur lors de la récupération des statistiques" });
  }
});

export default router;
