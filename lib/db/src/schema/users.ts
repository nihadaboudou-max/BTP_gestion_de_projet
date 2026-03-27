import { pgTable, serial, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "CHEF_CHANTIER", "OUVRIER"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("OUVRIER"),
  isActive: boolean("is_active").notNull().default(true),
  canAddWorkers: boolean("can_add_workers").notNull().default(false),
  canDeleteWorkers: boolean("can_delete_workers").notNull().default(false),
  canEditWorkers: boolean("can_edit_workers").notNull().default(false),
  canAddExpenses: boolean("can_add_expenses").notNull().default(false),
  canDeleteExpenses: boolean("can_delete_expenses").notNull().default(false),
  canAddProjects: boolean("can_add_projects").notNull().default(false),
  canViewFinances: boolean("can_view_finances").notNull().default(false),
  canManagePointage: boolean("can_manage_pointage").notNull().default(false),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
