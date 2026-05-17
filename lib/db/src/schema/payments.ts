/**
 * Table payments — Trace les paiements de paie hebdomadaire effectués
 * à chaque ouvrier, basés sur l'agrégation des fiches de pointage de la période.
 */
import { pgTable, serial, integer, numeric, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { personnelTable } from "./personnel";
import { usersTable } from "./users";

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",          // Espèces
  "BANK_TRANSFER", // Virement bancaire
  "MOBILE_MONEY",  // Mobile Money (Orange Money, Wave, MTN, etc.)
  "CHECK",         // Chèque
  "OTHER",         // Autre
]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("CASH"),
  reference: text("reference"),
  notes: text("notes"),
  paidBy: integer("paid_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
