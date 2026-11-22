import "server-only";

import type { Types } from "mongoose";

import { connectDb } from "@/server/db/connection";
import { AuditLog, type AuditLogRecord } from "@/server/db/models/audit-log";
import { logger } from "@/server/logger";

export type AuditEntry = {
  action: string;
  actorId?: Types.ObjectId | string | undefined;
  targetType?: string;
  targetId?: string;
  meta?: AuditLogRecord["meta"];
  ip?: string;
};

/**
 * Appends an audit record. A failure to write is logged loudly but never blocks the action it describes:
 * losing an audit line must not turn into a customer-facing outage.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await connectDb();
    await AuditLog.create(entry);
  } catch (error) {
    logger.error({ err: error, action: entry.action }, "Could not write audit log entry");
  }
}

export type AuditPage = {
  entries: {
    id: string;
    action: string;
    actorId?: string;
    targetType?: string;
    targetId?: string;
    meta?: AuditLogRecord["meta"];
    ip?: string;
    createdAt: string;
  }[];
  nextCursor?: string;
};

/** Newest first, cursor = createdAt of the last row returned. */
export async function listAudit(options: { limit: number; before?: Date }): Promise<AuditPage> {
  await connectDb();
  const rows = await AuditLog.find(options.before ? { createdAt: { $lt: options.before } } : {})
    .sort({ createdAt: -1 })
    .limit(options.limit + 1)
    .lean();
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    entries: page.map((row) => ({
      id: String(row._id),
      action: row.action,
      ...(row.actorId ? { actorId: String(row.actorId) } : {}),
      ...(row.targetType ? { targetType: row.targetType } : {}),
      ...(row.targetId ? { targetId: row.targetId } : {}),
      ...(row.meta ? { meta: row.meta } : {}),
      ...(row.ip ? { ip: row.ip } : {}),
      createdAt: row.createdAt.toISOString(),
    })),
    ...(rows.length > options.limit && last ? { nextCursor: last.createdAt.toISOString() } : {}),
  };
}
