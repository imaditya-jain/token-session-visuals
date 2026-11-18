/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeRedirectPath(value: string | null | undefined, fallback = "/account"): string {
  if (!value || value.length > 200) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if ([...value].some((character) => character.charCodeAt(0) < 32)) return fallback;
  return value;
}
