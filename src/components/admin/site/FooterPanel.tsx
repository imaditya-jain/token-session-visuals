"use client";

import IconButton from "@/components/admin/IconButton";
import ChromeEditor, { fieldClass, Section } from "@/components/admin/site/ChromeEditor";
import LinkRows from "@/components/admin/site/LinkRows";
import { Button } from "@/components/ui/button";
import { moveItem, patchAt, removeAt } from "@/lib/array-edit";

function Field({
  id,
  label,
  value,
  onChange,
  max,
  hint,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  hint?: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function FooterPanel() {
  return (
    <ChromeEditor
      title="Footer"
      lead="The footer on every page, and the newsletter sign-up block on the home page."
    >
      {(draft, update) => {
        const footer = draft.footer;
        const setFooter = (patch: Partial<typeof footer>) =>
          update({ ...draft, footer: { ...footer, ...patch } });
        const setContact = (patch: Partial<typeof footer.contact>) =>
          setFooter({ contact: { ...footer.contact, ...patch } });
        const nl = draft.newsletter;
        const setNl = (patch: Partial<typeof nl>) =>
          update({ ...draft, newsletter: { ...nl, ...patch } });
        return (
          <>
            <Section title="About text" hint="The short paragraph under the logo.">
              <label htmlFor="footer-about" className="sr-only">
                About text
              </label>
              <textarea
                id="footer-about"
                rows={3}
                maxLength={400}
                value={footer.about}
                onChange={(event) => setFooter({ about: event.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Section>

            <Section title="Contact information" hint="Leave a field empty to hide that line.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="c-address"
                  label="Address"
                  value={footer.contact.address}
                  max={200}
                  onChange={(address) => setContact({ address })}
                />
                <Field
                  id="c-hours"
                  label="Opening hours"
                  value={footer.contact.hours}
                  max={120}
                  onChange={(hours) => setContact({ hours })}
                />
                <Field
                  id="c-email"
                  label="Email"
                  type="email"
                  value={footer.contact.email}
                  max={254}
                  onChange={(email) => setContact({ email })}
                  hint="Also shown in the phone menu."
                />
                <Field
                  id="c-phone"
                  label="Phone (as shown)"
                  value={footer.contact.phone}
                  max={40}
                  onChange={(phone) => setContact({ phone })}
                />
                <Field
                  id="c-dial"
                  label="Number to dial"
                  value={footer.contact.phoneDial}
                  max={20}
                  onChange={(phoneDial) => setContact({ phoneDial })}
                  hint="With country code, e.g. +15035550142. What the phone link calls."
                />
              </div>
            </Section>

            <Section
              title="Footer columns"
              hint="Up to five columns of links. Reorder them, or add and remove whole columns."
            >
              <ul aria-label="Footer columns" className="space-y-5">
                {footer.columns.map((column, index) => {
                  const setColumns = (columns: typeof footer.columns) => setFooter({ columns });
                  return (
                    <li key={index} className="rounded-lg bg-background p-4 ring-1 ring-border/60">
                      <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div className="min-w-[10rem] flex-1">
                          <Field
                            id={`col-heading-${index}`}
                            label="Column heading"
                            value={column.heading}
                            max={30}
                            onChange={(heading) =>
                              setColumns(patchAt(footer.columns, index, { heading }))
                            }
                          />
                        </div>
                        <div className="flex">
                          <IconButton
                            label={`Move column ${column.heading || index + 1} left`}
                            disabled={index === 0}
                            onClick={() => setColumns(moveItem(footer.columns, index, -1))}
                          >
                            ←
                          </IconButton>
                          <IconButton
                            label={`Move column ${column.heading || index + 1} right`}
                            disabled={index === footer.columns.length - 1}
                            onClick={() => setColumns(moveItem(footer.columns, index, 1))}
                          >
                            →
                          </IconButton>
                          <IconButton
                            label={`Remove column ${column.heading || index + 1}`}
                            danger
                            onClick={() => setColumns(removeAt(footer.columns, index))}
                          >
                            ✕
                          </IconButton>
                        </div>
                      </div>
                      <LinkRows
                        title={`Links in ${column.heading || `column ${index + 1}`}`}
                        rows={column.links}
                        max={10}
                        makeRow={() => ({ label: "", href: "" })}
                        onChange={(links) => setColumns(patchAt(footer.columns, index, { links }))}
                      />
                    </li>
                  );
                })}
                {footer.columns.length < 5 ? (
                  <li>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() =>
                        setFooter({ columns: [...footer.columns, { heading: "", links: [] }] })
                      }
                    >
                      Add a column
                    </Button>
                  </li>
                ) : null}
              </ul>
            </Section>

            <Section
              title="Legal links and copyright"
              hint="Shown on the bottom line. The year is added automatically."
            >
              <div className="mb-5 max-w-xl">
                <Field
                  id="copyright"
                  label="Copyright text"
                  value={footer.copyright}
                  max={120}
                  onChange={(copyright) => setFooter({ copyright })}
                />
              </div>
              <LinkRows
                title="Legal links"
                rows={footer.legal}
                max={6}
                makeRow={() => ({ label: "", href: "" })}
                onChange={(legal) => setFooter({ legal })}
              />
            </Section>

            <Section
              title="Newsletter sign-up"
              hint="The block above the footer on the home page. The sign-up itself is unchanged."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="nl-eyebrow"
                  label="Small heading"
                  value={nl.eyebrow}
                  max={60}
                  onChange={(eyebrow) => setNl({ eyebrow })}
                />
                <Field
                  id="nl-heading"
                  label="Heading"
                  value={nl.heading}
                  max={100}
                  onChange={(heading) => setNl({ heading })}
                />
                <div className="sm:col-span-2">
                  <label htmlFor="nl-text" className="mb-1.5 block text-sm font-medium">
                    Text
                  </label>
                  <textarea
                    id="nl-text"
                    rows={2}
                    maxLength={300}
                    value={nl.text}
                    onChange={(event) => setNl({ text: event.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <Field
                  id="nl-button"
                  label="Button label"
                  value={nl.buttonLabel}
                  max={24}
                  onChange={(buttonLabel) => setNl({ buttonLabel })}
                />
                <Field
                  id="nl-foot"
                  label="Small print"
                  value={nl.footnote}
                  max={120}
                  onChange={(footnote) => setNl({ footnote })}
                />
              </div>
            </Section>
          </>
        );
      }}
    </ChromeEditor>
  );
}
