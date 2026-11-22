/**
 * CSV for spreadsheets. Besides quoting, cells that would be read as a formula (`=`, `+`, `-`, `@`, tab or carriage
 * return first) are prefixed with an apostrophe: visitor-written text must never run as a formula in Excel or Sheets.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Written as a code point so the byte-order mark can never be lost to an editor or formatter. */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  // The BOM makes Excel read UTF-8 (names, plant words) correctly.
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
