/**
 * Table companies — Entité racine du multi-tenant.
 * Chaque entreprise cliente est isolée par son `id` (companyId).
 * Le SUPER_ADMIN peut voir toutes les entreprises sans appartenir à aucune.
 */
import { pgTable, serial, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companyPlanEnum = pgEnum("company_plan", ["FREE", "STARTER", "PRO", "ENTERPRISE"]);
export const companyStatusEnum = pgEnum("company_status", ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]);

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerEmail: text("owner_email"),
  phone: text("phone"),
  address: text("address"),
  country: text("country").default("SN"),
  currency: text("currency").notNull().default("FCFA"),
  logoUrl: text("logo_url"),
  plan: companyPlanEnum("plan").notNull().default("FREE"),
  status: companyStatusEnum("status").notNull().default("TRIAL"),
  trialEndsAt: timestamp("trial_ends_at"),
  // Limites par plan (pour usage métier)
  maxUsers: integer("max_users").default(5),
  maxProjects: integer("max_projects").default(3),
  // Méta
  notes: text("notes"),  // Notes internes du super-admin (invisibles au client)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

/**
 * Table impersonation_logs — Audit séparé des accès super-admin
 * en mode "se connecter en tant que". INVISIBLE côté client.
 */
export const impersonationLogsTable = pgTable("impersonation_logs", {
  id: serial("id").primaryKey(),
  superAdminId: integer("super_admin_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  targetCompanyId: integer("target_company_id").notNull(),
  reason: text("reason"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});
