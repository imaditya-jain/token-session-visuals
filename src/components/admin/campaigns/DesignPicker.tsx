"use client";

import { DESIGNS, LAYOUTS, PALETTES, findPalette, type Palette } from "@/lib/email-designs";

/** A small diagram of how a layout arranges the message, drawn in the chosen palette. */
function Thumb({ layout, p }: { layout: string; p: Palette }) {
  const bar = (w: string, h = 3, color = p.muted) => (
    <div style={{ width: w, height: h, background: color, borderRadius: 1, opacity: 0.7 }} />
  );
  const heading = (align: "left" | "center" = "left", color = p.heading) => (
    <div style={{ display: "flex", justifyContent: align === "center" ? "center" : "flex-start" }}>
      <div style={{ width: "60%", height: 5, background: color, borderRadius: 1 }} />
    </div>
  );
  const body = (
    <div style={{ display: "grid", gap: 3, marginTop: 4 }}>
      {bar("100%")}
      {bar("85%")}
    </div>
  );
  const btn = (
    <div style={{ width: 22, height: 6, background: p.button, borderRadius: 2, marginTop: 5 }} />
  );
  const pic = (
    <div style={{ height: 14, background: p.border, borderRadius: 2, margin: "4px 0" }} />
  );
  const frame: React.CSSProperties = {
    background: p.card,
    border: `1px solid ${p.border}`,
    padding: 6,
  };
  const content = (
    <>
      {heading()}
      {body}
      {btn}
    </>
  );
  const inner = (() => {
    switch (layout) {
      case "banner":
        return (
          <>
            <div style={{ background: p.band, height: 8, margin: -6, marginBottom: 6 }} />
            {content}
          </>
        );
      case "editorial":
        return (
          <div style={{ background: "transparent", padding: 0 }}>
            {bar("30%", 3, p.heading)}
            <div style={{ height: 2, background: p.heading, margin: "3px 0 6px" }} />
            {content}
          </div>
        );
      case "centered":
        return (
          <div style={{ textAlign: "center" }}>
            {heading("center")}
            {body}
            <div style={{ display: "flex", justifyContent: "center" }}>{btn}</div>
          </div>
        );
      case "hero":
        return (
          <>
            <div style={{ background: p.band, height: 5, margin: -6, marginBottom: 0 }} />
            <div style={{ height: 16, background: p.border, margin: "0 -6px 5px" }} />
            {content}
          </>
        );
      case "feature":
        return (
          <>
            <div style={{ background: p.band, height: 18, margin: -6, marginBottom: 6 }} />
            {body}
            {btn}
          </>
        );
      case "letter":
        return <div style={{ borderLeft: `3px solid ${p.accent}`, paddingLeft: 4 }}>{content}</div>;
      case "promo":
        return (
          <>
            <div style={{ background: p.band, height: 5, margin: -6, marginBottom: 5 }} />
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: 14, height: 4, background: p.accent, borderRadius: 4 }} />
            </div>
            {heading("center")}
            {pic}
            <div style={{ height: 7, background: p.button, borderRadius: 2, marginTop: 4 }} />
          </>
        );
      case "framed":
        return (
          <div style={{ border: `2px solid ${p.heading}`, margin: -5, padding: 3 }}>
            <div style={{ border: `1px solid ${p.border}`, padding: 3 }}>{content}</div>
          </div>
        );
      case "stripe":
        return (
          <div style={{ borderLeft: `5px solid ${p.band}`, margin: -6, padding: 6 }}>{content}</div>
        );
      case "split":
        return (
          <>
            <div style={{ background: p.band, height: 14, margin: -6, marginBottom: 6 }} />
            {body}
            {btn}
          </>
        );
      case "minimal":
        return (
          <div>
            {bar("25%", 2)}
            <div style={{ height: 5 }} />
            {heading()}
            {body}
            <div style={{ width: 20, height: 2, background: p.accent, marginTop: 6 }} />
          </div>
        );
      default:
        return content;
    }
  })();
  const bare = layout === "editorial" || layout === "minimal";
  return (
    <div aria-hidden="true" style={{ background: p.page, padding: 6, borderRadius: 4 }}>
      <div style={bare ? { padding: 4 } : frame}>{inner}</div>
    </div>
  );
}

/**
 * Chooses one of the 108 designs: first how the message is laid out, then the colours. The diagrams are drawn in
 * the palette currently selected, so the choice is visible before the full preview refreshes.
 */
export default function DesignPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const current = DESIGNS.find((d) => d.id === value) ?? DESIGNS[0]!;
  const palette = findPalette(current.palette);
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Layout</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {LAYOUTS.map((layout) => {
            const selected = layout.id === current.layout;
            return (
              <button
                key={layout.id}
                type="button"
                aria-pressed={selected}
                title={layout.description}
                onClick={() => onChange(`${layout.id}.${current.palette}`)}
                className={`rounded-lg p-1.5 text-left ring-1 transition ${selected ? "bg-forest/5 ring-2 ring-forest" : "ring-border hover:bg-muted"}`}
              >
                <Thumb layout={layout.id} p={palette} />
                <span className="mt-1 block text-xs font-medium">{layout.name}</span>
                <span className="sr-only">{layout.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colours</legend>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => {
            const selected = p.id === current.palette;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(`${current.layout}.${p.id}`)}
                className={`flex min-h-11 items-center gap-2 rounded-full px-3 text-sm ring-1 ${selected ? "bg-forest/5 ring-2 ring-forest" : "ring-border hover:bg-muted"}`}
              >
                <span aria-hidden="true" className="flex">
                  {[p.page, p.band, p.button].map((c, i) => (
                    <span
                      key={i}
                      className="-ml-1 size-4 rounded-full ring-1 ring-black/10 first:ml-0"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Design: <span className="font-medium text-foreground">{current.name}</span> (one of{" "}
        {DESIGNS.length})
      </p>
    </div>
  );
}
