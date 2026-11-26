/** The Fernwood mark: a sprout with two leaves inside a rounded seed. Pure SVG, colours follow the tokens. */
export function LogoMark({
  className = "size-9",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const seed = tone === "light" ? "fill-forest" : "fill-cream";
  const leaf = tone === "light" ? "fill-cream" : "fill-forest-deep";
  const stem = tone === "light" ? "stroke-cream" : "stroke-forest-deep";
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      <path
        className={seed}
        d="M20 1.5C30.5 1.5 38.5 9.5 38.5 20S30.5 38.5 20 38.5 1.5 30.5 1.5 20 9.5 1.5 20 1.5Z"
      />
      <path className={stem} d="M20 31V19" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path className={leaf} d="M20 21.5C20 15 15.5 11 9 11c0 6.5 4 10.5 11 10.5Z" />
      <path className={leaf} d="M20 18C20 12 24 8 31 8c0 6-3.5 10-11 10Z" />
    </svg>
  );
}

/** Mark + wordmark. The text stays real text so the link keeps its accessible name. */
export default function Logo({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark tone={tone} className="size-8 shrink-0 lg:size-9" />
      <span>Fernwood</span>
    </span>
  );
}
