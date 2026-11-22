"use client";

import IconButton from "@/components/admin/IconButton";
import ChromeEditor, { fieldClass, Section } from "@/components/admin/site/ChromeEditor";
import SocialIcon from "@/components/storefront/SocialIcon";
import { Button } from "@/components/ui/button";
import { moveItem, patchAt, removeAt } from "@/lib/array-edit";
import {
  isPlaceholderUrl,
  SOCIAL_PLATFORM_IDS,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/site-chrome";

export default function SocialPanel() {
  return (
    <ChromeEditor
      title="Social links"
      lead="The icons in the footer of every page. Use the full https:// address of each profile (for WhatsApp, https://wa.me/ and the number)."
    >
      {(draft, update) => {
        const social = draft.social;
        const set = (next: typeof social) => update({ ...draft, social: next });
        const unused = SOCIAL_PLATFORM_IDS.filter((id) => !social.some((s) => s.platform === id));
        return (
          <Section
            title="Profiles"
            hint="Switch a link off to hide its icon without losing the address. Order here is the order on the site."
          >
            {social.some((s) => s.enabled && isPlaceholderUrl(s.url)) ? (
              <p
                role="status"
                className="mb-4 rounded-md border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-foreground"
              >
                Some icons have no real address yet. They still show on the site (pointing at the
                footer) until you publish, and are then hidden unless you add an address.
              </p>
            ) : null}
            <ul aria-label="Social links" className="space-y-3">
              {social.map((entry, index) => {
                const name = SOCIAL_PLATFORMS[entry.platform];
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-end gap-3 rounded-lg bg-background p-3 ring-1 ring-border/60"
                  >
                    <span
                      className="mb-3 flex size-9 items-center justify-center rounded-full bg-forest text-cream"
                      aria-hidden
                    >
                      <SocialIcon platform={entry.platform} />
                    </span>
                    <div className="min-w-[14rem] flex-1">
                      <label
                        htmlFor={`social-${entry.id}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        {name} address
                      </label>
                      <input
                        id={`social-${entry.id}`}
                        value={isPlaceholderUrl(entry.url) ? "" : entry.url}
                        placeholder="https://"
                        inputMode="url"
                        onChange={(event) =>
                          set(patchAt(social, index, { url: event.target.value }))
                        }
                        className={fieldClass}
                      />
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--forest)]"
                        checked={entry.enabled}
                        onChange={(event) =>
                          set(patchAt(social, index, { enabled: event.target.checked }))
                        }
                      />
                      <span>
                        Show <span className="sr-only">{name}</span>
                      </span>
                    </label>
                    <div className="flex">
                      <IconButton
                        label={`Move ${name} up`}
                        disabled={index === 0}
                        onClick={() => set(moveItem(social, index, -1))}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={`Move ${name} down`}
                        disabled={index === social.length - 1}
                        onClick={() => set(moveItem(social, index, 1))}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label={`Remove ${name}`}
                        danger
                        onClick={() => set(removeAt(social, index))}
                      >
                        ✕
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            {unused.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Add a profile</p>
                <div className="flex flex-wrap gap-2">
                  {unused.map((platform: SocialPlatform) => (
                    <Button
                      key={platform}
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() =>
                        set([...social, { id: platform, platform, url: "", enabled: false }])
                      }
                    >
                      {SOCIAL_PLATFORMS[platform]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>
        );
      }}
    </ChromeEditor>
  );
}
