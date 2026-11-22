export const ENQUIRY_KINDS = ["contact", "wholesale"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

/** The stages an enquiry moves through. Each kind has its own, in the order a person works through them. */
export const ENQUIRY_STATUSES = {
  contact: ["new", "in_progress", "resolved"],
  wholesale: ["new", "in_review", "approved", "rejected"],
} as const satisfies Record<EnquiryKind, readonly string[]>;

export type ContactStatus = (typeof ENQUIRY_STATUSES.contact)[number];
export type WholesaleStatus = (typeof ENQUIRY_STATUSES.wholesale)[number];
export type EnquiryStatus = ContactStatus | WholesaleStatus;

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export const isStatusOf = (kind: EnquiryKind, status: string): status is EnquiryStatus =>
  (ENQUIRY_STATUSES[kind] as readonly string[]).includes(status);

export const KIND_LABELS: Record<EnquiryKind, { singular: string; plural: string }> = {
  contact: { singular: "Contact message", plural: "Contact messages" },
  wholesale: { singular: "Wholesale application", plural: "Wholesale applications" },
};

export type EnquiryNote = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};
export type EnquiryHistoryEntry = { status: EnquiryStatus; byName: string; at: string };

export type EnquiryListItem = {
  id: string;
  kind: EnquiryKind;
  reference: string;
  status: EnquiryStatus;
  name: string;
  email: string;
  /** Contact: the topic. Wholesale: the business name. */
  headline: string;
  preview: string;
  assignedToName: string | null;
  archived: boolean;
  createdAt: string;
  noteCount: number;
};

export type EnquiryDetail = EnquiryListItem & {
  phone: string | null;
  topic: string | null;
  businessName: string | null;
  businessType: string | null;
  location: string | null;
  taxId: string | null;
  message: string;
  assignedTo: string | null;
  notes: EnquiryNote[];
  history: EnquiryHistoryEntry[];
};

export type EnquiryCounts = Record<string, number> & { all: number };
