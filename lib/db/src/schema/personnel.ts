import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractTypeEnum = pgEnum("contract_type", ["CDI", "CDD", "JOURNALIER"]);

export const personnelTable = pgTable("personnel", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  phone: text("phone"),
  idNumber: text("id_number"),
  emergencyContact: text("emergency_contact"),
  dailyWage: numeric("daily_wage", { precision: 15, scale: 2 }).notNull().default("0"),
  contractType: contractTypeEnum("contract_type").notNull().default("JOURNALIER"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const personnelProjectsTable = pgTable("personnel_projects", {
  id: serial("id").primaryKey(),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  projectId: integer("project_id").notNull(),
});

export const insertPersonnelSchema = createInsertSchema(personnelTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPersonnel = z.infer<typeof insertPersonnelSchema>;
export type Personnel = typeof personnelTable.$inferSelect;
