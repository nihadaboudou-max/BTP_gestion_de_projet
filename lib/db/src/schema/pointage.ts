import { pgTable, serial, text, integer, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";
import { personnelTable } from "./personnel";

export const pointageStatusEnum = pgEnum("pointage_status", ["BROUILLON", "SOUMISE", "APPROUVEE", "REJETEE", "ARCHIVEE"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "ABSENT", "DEMI_JOURNEE"]);

export const pointageSheetsTable = pgTable("pointage_sheets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  date: date("date").notNull(),
  chefId: integer("chef_id").notNull().references(() => usersTable.id),
  status: pointageStatusEnum("status").notNull().default("BROUILLON"),
  signatureData: text("signature_data"),
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
  departureTime: text("departure_time"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  dailyWage: numeric("daily_wage", { precision: 15, scale: 2 }),
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
