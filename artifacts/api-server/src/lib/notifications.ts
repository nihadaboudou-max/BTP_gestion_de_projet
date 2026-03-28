import type { Server as SocketServer } from "socket.io";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";

let io: SocketServer | null = null;

export function setSocketServer(server: SocketServer) {
  io = server;
}

export function broadcastRefresh(event: string, data?: any) {
  if (io) {
    io.emit(event, data ?? {});
  }
}

export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: string;
}) {
  try {
    const [notif] = await db.insert(notificationsTable).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      relatedId: params.relatedId,
      relatedType: params.relatedType,
    }).returning();

    if (io) {
      io.to(`user:${params.userId}`).emit("notification", notif);
      io.to(`user:${params.userId}`).emit("refresh:notifications", {});
    }
    return notif;
  } catch {
    return null;
  }
}

export async function notifyAdmins(db_: typeof db, params: {
  type: string;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: string;
}) {
  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const admins = await db_.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "ADMIN"));
    for (const admin of admins) {
      await createNotification({ userId: admin.id, ...params });
    }
  } catch {
    // silent
  }
}
