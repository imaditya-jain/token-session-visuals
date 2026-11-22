/** Dates are shown in UTC so the server-rendered text is identical for every visitor and time zone. */
export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
