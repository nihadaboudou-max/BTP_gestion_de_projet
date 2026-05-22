import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { pointageSheetsTable } from "./pointage";

export const reclamationTypeEnum = pgEnum("reclamation_type", ["ERREUR_SALAIRE", "ERREUR_PRESENCE", "ERREUR_HEURES", "AUTRE"]);
export const reclamationStatusEnum = pgEnum("reclamation_status", ["EN_ATTENTE", "TRAITEE", "REJETEE"]);

export const reclamationsTable = pgTable("reclamations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  sheetId: integer("sheet_id").references(() => pointageSheetsTable.id),
  entryId: integer("entry_id"),
  type: reclamationTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: reclamationStatusEnum("status").notNull().default("EN_ATTENTE"),
  adminResponse: text("admin_response"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReclamationSchema = createInsertSchema(reclamationsTable).omit({ id: true, createdAt: true });
export type InsertReclamation = z.infer<typeof insertReclamationSchema>;
export type Reclamation = typeof reclamationsTable.$inferSelect;
