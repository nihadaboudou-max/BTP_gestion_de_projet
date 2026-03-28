import { pgTable, serial, integer, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const presenceStatusEnum = pgEnum("presence_status", ["PRESENT", "ABSENT", "INCERTAIN"]);

export const presenceConfirmationsTable = pgTable("presence_confirmations", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  date: date("date").notNull(),
  status: presenceStatusEnum("presence_status").notNull(),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
});

export const insertPresenceConfirmationSchema = createInsertSchema(presenceConfirmationsTable).omit({ id: true, confirmedAt: true });
export type InsertPresenceConfirmation = z.infer<typeof insertPresenceConfirmationSchema>;
export type PresenceConfirmation = typeof presenceConfirmationsTable.$inferSelect;
