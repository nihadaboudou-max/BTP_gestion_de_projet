import { pgTable, serial, text, integer, numeric, date, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";
import { personnelTable } from "./personnel";
import { tasksTable } from "./tasks";

export const pointageStatusEnum = pgEnum("pointage_status", ["BROUILLON", "SOUMISE", "APPROUVEE", "REJETEE", "ARCHIVEE"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "ABSENT", "DEMI_JOURNEE", "HEURE_SUP"]);
export const payModeEnum = pgEnum("pay_mode", ["PAR_JOUR", "PAR_TACHE"]);

export const pointageSheetsTable = pgTable("pointage_sheets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  date: date("date").notNull(),
  chefId: integer("chef_id").notNull().references(() => usersTable.id),
  status: pointageStatusEnum("status").notNull().default("BROUILLON"),
  signatureData: text("signature_data"),
  chefSignature: text("chef_signature"),
  chefSignedAt: timestamp("chef_signed_at"),
  locked: boolean("locked").notNull().default(false),
  adminComment: text("admin_comment"),
  totalPay: numeric("total_pay", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
});

export const pointageEntriesTable = pgTable("pointage_entries", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull().references(() => pointageSheetsTable.id),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  status: attendanceStatusEnum("status").notNull().default("PRESENT"),
  arrivalTime: text("arrival_time"),
  arrivalSignature: text("arrival_signature"),
  arrivalSignedAt: timestamp("arrival_signed_at"),
  departureTime: text("departure_time"),
  departureSignature: text("departure_signature"),
  departureSignedAt: timestamp("departure_signed_at"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  overtimeHours: numeric("overtime_hours", { precision: 4, scale: 2 }).default("0"),
  payMode: payModeEnum("pay_mode").default("PAR_JOUR"),
  dailyWage: numeric("daily_wage", { precision: 15, scale: 2 }),
  taskId: integer("task_id").references(() => tasksTable.id),
  taskAmount: numeric("task_amount", { precision: 15, scale: 2 }),
  taskProgressPct: integer("task_progress_pct").default(100),
  amountDue: numeric("amount_due", { precision: 15, scale: 2 }),
  totalPay: numeric("total_pay", { precision: 15, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPointageSheetSchema = createInsertSchema(pointageSheetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPointageEntrySchema = createInsertSchema(pointageEntriesTable).omit({ id: true, createdAt: true });
export type InsertPointageSheet = z.infer<typeof insertPointageSheetSchema>;
export type InsertPointageEntry = z.infer<typeof insertPointageEntrySchema>;
export type PointageSheet = typeof pointageSheetsTable.$inferSelect;
export type PointageEntry = typeof pointageEntriesTable.$inferSelect;
