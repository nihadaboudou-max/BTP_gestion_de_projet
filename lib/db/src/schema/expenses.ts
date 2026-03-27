import { pgTable, serial, text, integer, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const expenseCategoryEnum = pgEnum("expense_category", ["MATERIAUX", "EQUIPEMENTS", "TRANSPORT", "CARBURANT", "NOURRITURE", "AUTRE"]);
export const expenseStatusEnum = pgEnum("expense_status", ["EN_ATTENTE", "APPROUVEE", "REJETEE"]);

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  title: text("title").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  supplier: text("supplier"),
  receiptUrl: text("receipt_url"),
  addedById: integer("added_by_id").notNull().references(() => usersTable.id),
  status: expenseStatusEnum("status").notNull().default("EN_ATTENTE"),
  adminComment: text("admin_comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
