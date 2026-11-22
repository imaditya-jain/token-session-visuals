"use client";

import ChromeEditor, { fieldClass, Section } from "@/components/admin/site/ChromeEditor";
import IconButton from "@/components/admin/IconButton";
import LinkRows from "@/components/admin/site/LinkRows";
import { Button } from "@/components/ui/button";
import { moveItem, patchAt, removeAt } from "@/lib/array-edit";

export default function HeaderPanel() {
  return (
    <ChromeEditor
      title="Header & announcement"
      lead="The announcement bar above the header and the main menu, on every page. Menu items can open a dropdown."
    >
      {(draft, update) => (
        <>
          <Section
            title="Announcement bar"
            hint="A short message strip. Up to four messages are shown side by side."
          >
            <label className="mb-4 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--forest)]"
                checked={draft.announcement.enabled}
                onChange={(event) =>
                  update({
                    ...draft,
                    announcement: { ...draft.announcement, enabled: event.target.checked },
                  })
                }
              />
              Show the announcement bar
            </label>
            <ul aria-label="Announcement messages" className="space-y-3">
              {draft.announcement.items.map((item, index) => {
                const setItems = (items: typeof draft.announcement.items) =>
                  update({ ...draft, announcement: { ...draft.announcement, items } });
                return (
                  <li
                    key={index}
                    className="flex flex-wrap items-end gap-2 rounded-lg bg-background p-3 ring-1 ring-border/60"
                  >
                    <div className="min-w-[12rem] flex-[2]">
                      <label
                        htmlFor={`ann-text-${index}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Message
                      </label>
                      <input
                        id={`ann-text-${index}`}
                        value={item.text}
                        maxLength={120}
                        onChange={(event) =>
                          setItems(
                            patchAt(draft.announcement.items, index, { text: event.target.value }),
                          )
                        }
                        className={fieldClass}
                      />
                    </div>
                    <div className="min-w-[8rem] flex-1">
                      <label
                        htmlFor={`ann-hl-${index}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Highlighted words
                      </label>
                      <input
                        id={`ann-hl-${index}`}
                        value={item.highlight}
                        maxLength={60}
                        onChange={(event) =>
                          setItems(
                            patchAt(draft.announcement.items, index, {
                              highlight: event.target.value,
                            }),
                          )
                        }
                        className={fieldClass}
                      />
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--forest)]"
                        checked={item.hideOnMobile}
                        onChange={(event) =>
                          setItems(
                            patchAt(draft.announcement.items, index, {
                              hideOnMobile: event.target.checked,
                            }),
                          )
                        }
                      />
                      Hide on phones
                    </label>
                    <div className="flex">
                      <IconButton
                        label={`Move message ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => setItems(moveItem(draft.announcement.items, index, -1))}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={`Move message ${index + 1} down`}
                        disabled={index === draft.announcement.items.length - 1}
                        onClick={() => setItems(moveItem(draft.announcement.items, index, 1))}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label={`Remove message ${index + 1}`}
                        danger
                        onClick={() => setItems(removeAt(draft.announcement.items, index))}
                      >
                        ✕
                      </IconButton>
                    </div>
                  </li>
                );
              })}
              {draft.announcement.items.length < 4 ? (
                <li>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() =>
                      update({
                        ...draft,
                        announcement: {
                          ...draft.announcement,
                          items: [
                            ...draft.announcement.items,
                            { text: "", highlight: "", hideOnMobile: false },
                          ],
                        },
                      })
                    }
                  >
                    Add a message
                  </Button>
                </li>
              ) : null}
            </ul>
          </Section>

          <Section
            title="Main menu"
            hint="Shown in the header on large screens and in the slide-out menu on phones. Add links under an item to make it a dropdown."
          >
            <ul aria-label="Menu items" className="space-y-4">
              {draft.header.nav.map((item, index) => {
                const setNav = (nav: typeof draft.header.nav) =>
                  update({ ...draft, header: { ...draft.header, nav } });
                return (
                  <li key={index} className="rounded-lg bg-background p-4 ring-1 ring-border/60">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[8rem] flex-1">
                        <label
                          htmlFor={`nav-label-${index}`}
                          className="mb-1 block text-xs text-muted-foreground"
                        >
                          Label
                        </label>
                        <input
                          id={`nav-label-${index}`}
                          value={item.label}
                          maxLength={40}
                          onChange={(event) =>
                            setNav(patchAt(draft.header.nav, index, { label: event.target.value }))
                          }
                          className={fieldClass}
                        />
                      </div>
                      <div className="min-w-[12rem] flex-[2]">
                        <label
                          htmlFor={`nav-href-${index}`}
                          className="mb-1 block text-xs text-muted-foreground"
                        >
                          Link
                        </label>
                        <input
                          id={`nav-href-${index}`}
                          value={item.href}
                          placeholder="/shop or https://…"
                          onChange={(event) =>
                            setNav(patchAt(draft.header.nav, index, { href: event.target.value }))
                          }
                          className={fieldClass}
                        />
                      </div>
                      <div className="flex">
                        <IconButton
                          label={`Move ${item.label || "item"} up`}
                          disabled={index === 0}
                          onClick={() => setNav(moveItem(draft.header.nav, index, -1))}
                        >
                          ↑
                        </IconButton>
                        <IconButton
                          label={`Move ${item.label || "item"} down`}
                          disabled={index === draft.header.nav.length - 1}
                          onClick={() => setNav(moveItem(draft.header.nav, index, 1))}
                        >
                          ↓
                        </IconButton>
                        <IconButton
                          label={`Remove ${item.label || "item"}`}
                          danger
                          onClick={() => setNav(removeAt(draft.header.nav, index))}
                        >
                          ✕
                        </IconButton>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="mb-2 text-sm font-medium">
                        Dropdown links under {item.label || "this item"}{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <LinkRows
                        title={`Dropdown links under ${item.label || `item ${index + 1}`}`}
                        rows={item.children}
                        max={8}
                        addLabel="Add a dropdown link"
                        makeRow={() => ({ label: "", href: "" })}
                        onChange={(children) =>
                          setNav(patchAt(draft.header.nav, index, { children }))
                        }
                      />
                    </div>
                  </li>
                );
              })}
              {draft.header.nav.length < 8 ? (
                <li>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() =>
                      update({
                        ...draft,
                        header: {
                          ...draft.header,
                          nav: [...draft.header.nav, { label: "", href: "", children: [] }],
                        },
                      })
                    }
                  >
                    Add a menu item
                  </Button>
                </li>
              ) : null}
            </ul>
          </Section>
        </>
      )}
    </ChromeEditor>
  );
}
