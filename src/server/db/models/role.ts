import "server-only";

import { Schema, type Types } from "mongoose";

import type { Permission } from "@/lib/permissions";
import { defineModel } from "@/server/db/define-model";

/** A custom admin role. Built-in roles (super_admin, editor) are defined in code, not stored here. */
export type RoleRecord = {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
};

const roleSchema = new Schema<RoleRecord>(
  {
    key: { type: String, required: true, unique: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Role = defineModel<RoleRecord>("Role", roleSchema);
