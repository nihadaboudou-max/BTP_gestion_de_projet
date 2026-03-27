import { pgTable, serial, text, integer, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const projectStatusEnum = pgEnum("project_status", ["PLANIFIE", "EN_COURS", "EN_PAUSE", "TERMINE"]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  clientName: text("client_name"),
  status: projectStatusEnum("status").notNull().default("PLANIFIE"),
  budgetTotal: numeric("budget_total", { precision: 15, scale: 2 }).notNull().default("0"),
  budgetSpent: numeric("budget_spent", { precision: 15, scale: 2 }).notNull().default("0"),
  progress: integer("progress").notNull().default(0),
  startDate: date("start_date"),
  endDate: date("end_date"),
  chefId: integer("chef_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
