"use client";

import { BLOG_TEMPLATES, BLOG_TEMPLATE_IDS, type BlogTemplateId } from "@/lib/blog-templates";

/** A small wireframe of each layout, so the choice is visible without opening a preview. */
function Thumb({ id }: { id: BlogTemplateId }) {
  const bar = "rounded-sm bg-forest/30";
  const line = "h-1 rounded-full bg-forest/20";
  const image = "rounded-sm bg-sage";
  return (
    <div
      aria-hidden
      className="h-24 w-full overflow-hidden rounded-md bg-background p-2 ring-1 ring-border"
    >
      {id === "classic" ? (
        <div className="flex h-full flex-col items-center gap-1.5">
          <div className={`h-2 w-2/3 ${bar}`} />
          <div className={`h-9 w-full ${image}`} />
          <div className={`${line} w-1/2`} />
          <div className={`${line} w-1/2`} />
          <div className={`${line} w-1/2`} />
        </div>
      ) : null}
      {id === "magazine" ? (
        <div className="flex h-full flex-col gap-1.5">
          <div className={`h-2 w-3/4 ${bar}`} />
          <div className={`h-7 w-full ${image}`} />
          <div className="flex flex-1 gap-1.5">
            <div className="flex flex-[2] flex-col gap-1">
              <div className={`${line} w-full`} />
              <div className={`${line} w-full`} />
              <div className={`${line} w-2/3`} />
            </div>
            <div className="flex-1 rounded-sm bg-muted" />
          </div>
        </div>
      ) : null}
      {id === "editorial" ? (
        <div className="flex h-full flex-col items-center gap-1.5">
          <div className="flex h-9 w-full flex-col justify-center gap-1 rounded-sm bg-forest-deep px-2">
            <div className="h-2 w-3/4 rounded-sm bg-cream/80" />
            <div className="h-1 w-1/2 rounded-full bg-cream/50" />
          </div>
          <div className={`${line} w-2/5`} />
          <div className={`${line} w-2/5`} />
          <div className={`${line} w-2/5`} />
        </div>
      ) : null}
      {id === "visual" ? (
        <div className="flex h-full flex-col gap-1.5">
          <div className="relative h-14 w-full rounded-sm bg-sage">
            <div className="absolute bottom-1 left-1 h-2 w-2/3 rounded-sm bg-cream/90" />
          </div>
          <div className={`${line} mx-auto w-3/5`} />
          <div className={`${line} mx-auto w-3/5`} />
        </div>
      ) : null}
      {id === "guide" ? (
        <div className="flex h-full flex-col gap-1.5">
          <div className={`h-2 w-2/3 ${bar}`} />
          <div className="flex flex-1 gap-1.5">
            <div className="flex flex-1 flex-col gap-1 rounded-sm bg-muted p-1">
              <div className="h-1 w-full rounded-full bg-forest/30" />
              <div className="h-1 w-3/4 rounded-full bg-forest/30" />
              <div className="h-1 w-2/3 rounded-full bg-forest/30" />
            </div>
            <div className="flex flex-[2] flex-col gap-1">
              <div className={`${line} w-full`} />
              <div className={`${line} w-full`} />
              <div className={`${line} w-3/4`} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TemplatePicker({
  value,
  onChange,
  disabled,
}: {
  value: BlogTemplateId;
  onChange: (next: BlogTemplateId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-foreground">Page template</legend>
      <div className="space-y-3">
        {BLOG_TEMPLATE_IDS.map((id) => {
          const selected = value === id;
          return (
            <label
              key={id}
              className={`block cursor-pointer rounded-lg p-3 ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                selected
                  ? "bg-sage-light/50 ring-2 ring-forest"
                  : "bg-card ring-border/60 hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="post-template"
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <Thumb id={id} />
              <span className="mt-2 block text-sm font-semibold text-forest">
                {BLOG_TEMPLATES[id].name}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {BLOG_TEMPLATES[id].description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
