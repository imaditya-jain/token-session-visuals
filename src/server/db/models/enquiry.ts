import "server-only";

import { Schema, type Types } from "mongoose";

import type { EnquiryKind, EnquiryStatus } from "@/lib/enquiries";
import { defineModel } from "@/server/db/define-model";

export type EnquiryNoteRecord = {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  text: string;
  createdAt: Date;
};

export type EnquiryRecord = {
  _id: Types.ObjectId;
  kind: EnquiryKind;
  /** Human-friendly id quoted to the sender and in emails, e.g. WS-250114-K3QX. */
  reference: string;
  status: EnquiryStatus;
  name: string;
  email: string;
  phone?: string | undefined;
  /** Contact messages only. */
  topic?: string | undefined;
  /** Wholesale applications only. */
  businessName?: string | undefined;
  businessType?: string | undefined;
  location?: string | undefined;
  taxId?: string | undefined;
  message: string;
  assignedTo?: Types.ObjectId | undefined;
  notes: EnquiryNoteRecord[];
  history: { status: EnquiryStatus; by?: Types.ObjectId | undefined; at: Date }[];
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const noteSchema = new Schema<EnquiryNoteRecord>({
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorName: { type: String, required: true, maxlength: 160 },
  text: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

const enquirySchema = new Schema<EnquiryRecord>(
  {
    kind: { type: String, enum: ["contact", "wholesale"], required: true },
    reference: { type: String, required: true, unique: true, maxlength: 30 },
    status: {
      type: String,
      enum: ["new", "in_progress", "resolved", "in_review", "approved", "rejected"],
      required: true,
      default: "new",
    },
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, maxlength: 254 },
    phone: { type: String, maxlength: 40 },
    topic: { type: String, maxlength: 80 },
    businessName: { type: String, maxlength: 160 },
    businessType: { type: String, maxlength: 80 },
    location: { type: String, maxlength: 160 },
    taxId: { type: String, maxlength: 60 },
    message: { type: String, required: true, maxlength: 3000 },
    assignedTo: { type: Schema.Types.ObjectId },
    notes: { type: [noteSchema], default: [] },
    history: {
      type: [
        new Schema(
          {
            status: { type: String, required: true },
            by: { type: Schema.Types.ObjectId },
            at: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

enquirySchema.index({ kind: 1, archivedAt: 1, status: 1, createdAt: -1 });
enquirySchema.index({ assignedTo: 1, kind: 1 });
enquirySchema.index({ email: 1, createdAt: -1 });

export const Enquiry = defineModel<EnquiryRecord>("Enquiry", enquirySchema);
