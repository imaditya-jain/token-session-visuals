import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type AuditLogRecord = {
  _id: Types.ObjectId;
  /** Absent for events with no signed-in actor (failed sign-ins). */
  actorId?: Types.ObjectId | undefined;
  /** Dot-separated verb, e.g. `auth.admin_login`, `user.role_changed`, `post.published`. */
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  /** Small, non-sensitive context (never passwords, codes, tokens or message bodies). */
  meta?: Record<string, string | number | boolean | null> | undefined;
  ip?: string | undefined;
  createdAt: Date;
};

const auditLogSchema = new Schema<AuditLogRecord>({
  actorId: { type: Schema.Types.ObjectId },
  action: { type: String, required: true, maxlength: 80 },
  targetType: { type: String, maxlength: 40 },
  targetId: { type: String, maxlength: 80 },
  meta: { type: Schema.Types.Mixed },
  ip: { type: String, maxlength: 64 },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = defineModel<AuditLogRecord>("AuditLog", auditLogSchema);
