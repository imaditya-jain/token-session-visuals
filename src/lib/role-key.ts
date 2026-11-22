import { roleKeySchema } from "@/lib/permissions";

/** Turns a role name into a valid key: "SEO Writer" → "seo_writer". Returns "" when nothing usable remains. */
export function roleKeyFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  const key = /^[a-z]/.test(slug) ? slug : slug ? `r_${slug}`.slice(0, 40) : "";
  return roleKeySchema.safeParse(key).success ? key : "";
}
