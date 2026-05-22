import { pgTable, serial, text, integer, date, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";
import { personnelTable } from "./personnel";

export const taskPriorityEnum = pgEnum("task_priority", ["BASSE", "NORMALE", "HAUTE", "URGENTE"]);
export const taskStatusEnum = pgEnum("task_status", ["A_FAIRE", "EN_COURS", "BLOQUEE", "TERMINEE"]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id),
  // NEW : affectation à un ouvrier ou prestataire de la base personnel
  assignedPersonnelId: integer("assigned_personnel_id").references(() => personnelTable.id),
  // Montant total de la tâche (utilisé pour le mode PRESTATAIRE %)
  taskAmount: numeric("task_amount", { precision: 15, scale: 2 }),
  // % d'avancement global (peut être mis à jour par le chef)
  progressPct: integer("progress_pct").default(0),
  dueDate: date("due_date"),
  priority: taskPriorityEnum("priority").notNull().default("NORMALE"),
  status: taskStatusEnum("status").notNull().default("A_FAIRE"),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
