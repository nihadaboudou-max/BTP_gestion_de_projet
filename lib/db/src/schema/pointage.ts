import { pgTable, serial, text, integer, numeric, date, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { usersTable } from "./users";
import { personnelTable } from "./personnel";
import { tasksTable } from "./tasks";

export const pointageStatusEnum = pgEnum("pointage_status", ["BROUILLON", "SOUMISE", "APPROUVEE", "REJETEE", "ARCHIVEE"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "ABSENT", "DEMI_JOURNEE", "HEURE_SUP"]);
// PAR_JOUR = tarif journalier classique
// PAR_TACHE = forfait sur une tâche × % avancement
// PRESTATAIRE = forfait prestataire payé chaque fin de semaine selon % évolution
// PAR_M2 = tarif au m² × surface produite par jour
export const payModeEnum = pgEnum("pay_mode", ["PAR_JOUR", "PAR_TACHE", "PRESTATAIRE", "PAR_M2"]);

export const pointageSheetsTable = pgTable("pointage_sheets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
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
  // Champs professionnels enrichis
  weather: text("weather"),                 // ENSOLEILLE, NUAGEUX, PLUVIEUX, ORAGEUX...
  siteLocation: text("site_location"),      // Localisation précise du chantier (zone, étage)
  observations: text("observations"),       // Observations / notes du chef
  workStartTime: text("work_start_time"),   // Heure officielle de début de chantier
  workEndTime: text("work_end_time"),       // Heure officielle de fin de chantier
  // Archivage
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by").references(() => usersTable.id),
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
  // Champs pour le mode PAR_M2 : surface produite ce jour-là + tarif au m²
  surfaceProduced: numeric("surface_produced", { precision: 10, scale: 2 }),
  ratePerSqm: numeric("rate_per_sqm", { precision: 15, scale: 2 }),
  // Champs pour le mode PRESTATAIRE : montant total contrat + % évolution semaine
  contractAmount: numeric("contract_amount", { precision: 15, scale: 2 }),
  weeklyProgressPct: integer("weekly_progress_pct"),
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
