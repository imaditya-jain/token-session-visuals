const LABELS: Record<string, string> = {
  "auth.admin_login": "Signed in to the admin",
  "auth.admin_login_failed": "Failed admin sign-in",
  "auth.admin_otp_failed": "Wrong admin sign-in code",
  "user.admin_invited": "Invited an admin",
  "user.admin_role_changed": "Changed an admin's role",
  "user.admin_status_changed": "Enabled or disabled an admin",
  "user.super_admin_bootstrapped": "First Super Admin created",
  "role.created": "Created a role",
  "role.updated": "Edited a role",
  "role.deleted": "Deleted a role",
};

/** Plain-language name for an audit action; unknown actions fall back to the raw verb. */
export const auditLabel = (action: string): string => LABELS[action] ?? action;
